import {
  DeliveryMediumType,
  InitiateAuthRequest,
  InitiateAuthResponse,
} from "aws-sdk/clients/cognitoidentityserviceprovider";
import { v4 } from "uuid";
import {
  InvalidParameterError,
  InvalidPasswordError,
  NotAuthorizedError,
  PasswordResetRequiredError,
  UnsupportedError,
} from "../errors";
import { Services, UserPoolService } from "../services";
import {
  attributesToRecord,
  attributeValue,
  MFAOption,
  User,
} from "../services/userPoolService";
import { Target } from "./Target";
import { Context } from "../services/context";

export type InitiateAuthTarget = Target<
  InitiateAuthRequest,
  InitiateAuthResponse
>;

type InitiateAuthServices = Pick<
  Services,
  "cognito" | "messages" | "otp" | "tokenGenerator" | "triggers"
>;

const verifyMfaChallenge = async (
  ctx: Context,
  user: User,
  req: InitiateAuthRequest,
  userPool: UserPoolService,
  services: InitiateAuthServices
): Promise<InitiateAuthResponse> => {
  if (!user.MFAOptions?.length) {
    throw new NotAuthorizedError();
  }
  const smsMfaOption = user.MFAOptions?.find(
    (x): x is MFAOption & { DeliveryMedium: DeliveryMediumType } =>
      x.DeliveryMedium === "SMS"
  );
  if (!smsMfaOption) {
    throw new UnsupportedError("MFA challenge without SMS");
  }

  const deliveryDestination = attributeValue(
    smsMfaOption.AttributeName,
    user.Attributes
  );
  if (!deliveryDestination) {
    throw new UnsupportedError(`SMS_MFA without ${smsMfaOption.AttributeName}`);
  }

  const code = services.otp();
  await services.messages.deliver(
    ctx,
    "Authentication",
    req.ClientId,
    userPool.config.Id,
    user,
    code,
    req.ClientMetadata,
    {
      DeliveryMedium: smsMfaOption.DeliveryMedium,
      AttributeName: smsMfaOption.AttributeName,
      Destination: deliveryDestination,
    }
  );

  await userPool.saveUser(ctx, {
    ...user,
    MFACode: code,
  });

  return {
    ChallengeName: "SMS_MFA",
    ChallengeParameters: {
      CODE_DELIVERY_DELIVERY_MEDIUM: "SMS",
      CODE_DELIVERY_DESTINATION: deliveryDestination,
      USER_ID_FOR_SRP: user.Username,
    },
  };
};

const verifyPasswordChallenge = async (
  ctx: Context,
  user: User,
  req: InitiateAuthRequest,
  userPool: UserPoolService,
  services: InitiateAuthServices
): Promise<InitiateAuthResponse> => {
  const tokens = await services.tokenGenerator.generate(
    ctx,
    user,
    req.ClientId,
    userPool.config.Id,
    // The docs for the pre-token generation trigger only say that the ClientMetadata is passed as part of the
    // AdminRespondToAuthChallenge and RespondToAuthChallenge triggers.
    //
    // source: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html
    undefined,
    "Authentication"
  );

  await userPool.storeRefreshToken(ctx, tokens.RefreshToken, user);

  return {
    ChallengeName: "PASSWORD_VERIFIER",
    ChallengeParameters: {},
    AuthenticationResult: tokens,
  };
};

const newPasswordChallenge = (user: User): InitiateAuthResponse => ({
  ChallengeName: "NEW_PASSWORD_REQUIRED",
  ChallengeParameters: {
    USER_ID_FOR_SRP: user.Username,
    requiredAttributes: JSON.stringify([]),
    userAttributes: JSON.stringify(attributesToRecord(user.Attributes)),
  },
  Session: v4(),
});

const userPasswordAuthFlow = async (
  ctx: Context,
  req: InitiateAuthRequest,
  userPool: UserPoolService,
  services: InitiateAuthServices
): Promise<InitiateAuthResponse> => {
  if (!req.AuthParameters) {
    throw new InvalidParameterError(
      "Missing required parameter authParameters"
    );
  }

  let user = await userPool.getUserByUsername(ctx, req.AuthParameters.USERNAME);

  if (!user && services.triggers.enabled("UserMigration")) {
    // https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html
    //
    // Amazon Cognito invokes [the User Migration] trigger when a user does not exist in the user pool at the time
    // of sign-in with a password, or in the forgot-password flow. After the Lambda function returns successfully,
    // Amazon Cognito creates the user in the user pool.
    user = await services.triggers.userMigration(ctx, {
      clientId: req.ClientId,
      password: req.AuthParameters.PASSWORD,
      userAttributes: [],
      username: req.AuthParameters.USERNAME,
      userPoolId: userPool.config.Id,

      // UserMigration triggered by InitiateAuth passes the request ClientMetadata as ValidationData and nothing as
      // the ClientMetadata.
      //
      // Source: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html#cognito-user-pools-lambda-trigger-syntax-user-migration
      clientMetadata: undefined,
      validationData: req.ClientMetadata,
    });
  }

  if (!user) {
    throw new NotAuthorizedError();
  }
  if (user.UserStatus === "RESET_REQUIRED") {
    throw new PasswordResetRequiredError();
  }
  if (user.UserStatus === "FORCE_CHANGE_PASSWORD") {
    return newPasswordChallenge(user);
  }
  if (user.Password !== req.AuthParameters.PASSWORD) {
    throw new InvalidPasswordError();
  }

  if (
    (userPool.config.MfaConfiguration === "OPTIONAL" &&
      (user.MFAOptions ?? []).length > 0) ||
    userPool.config.MfaConfiguration === "ON"
  ) {
    return verifyMfaChallenge(ctx, user, req, userPool, services);
  }

  const result = verifyPasswordChallenge(ctx, user, req, userPool, services);

  if (services.triggers.enabled("PostAuthentication")) {
    await services.triggers.postAuthentication(ctx, {
      clientId: req.ClientId,
      // As per the InitiateAuth docs, ClientMetadata is not passed to PostAuthentication when called from InitiateAuth
      // Source: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html#API_InitiateAuth_RequestSyntax
      clientMetadata: undefined,
      source: "PostAuthentication_Authentication",
      userAttributes: user.Attributes,
      username: user.Username,
      userPoolId: userPool.config.Id,
    });
  }

  return result;
};

const refreshTokenAuthFlow = async (
  ctx: Context,
  req: InitiateAuthRequest,
  services: InitiateAuthServices
): Promise<InitiateAuthResponse> => {
  if (!req.AuthParameters) {
    throw new InvalidParameterError(
      "Missing required parameter authParameters"
    );
  }

  if (!req.AuthParameters.REFRESH_TOKEN) {
    throw new InvalidParameterError("AuthParameters REFRESH_TOKEN is required");
  }

  const userPool = await services.cognito.getUserPoolForClientId(
    ctx,
    req.ClientId
  );
  const user = await userPool.getUserByRefreshToken(
    ctx,
    req.AuthParameters.REFRESH_TOKEN
  );
  if (!user) {
    throw new NotAuthorizedError();
  }

  const tokens = await services.tokenGenerator.generate(
    ctx,
    user,
    req.ClientId,
    userPool.config.Id,
    // The docs for the pre-token generation trigger only say that the ClientMetadata is passed as part of the
    // AdminRespondToAuthChallenge and RespondToAuthChallenge triggers.
    //
    // source: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html
    undefined,
    "RefreshTokens"
  );

  return {
    ChallengeName: undefined,
    Session: undefined,
    ChallengeParameters: undefined,
    AuthenticationResult: {
      AccessToken: tokens.AccessToken,
      RefreshToken: undefined,
      IdToken: tokens.IdToken,
      NewDeviceMetadata: undefined,
      TokenType: undefined,
      ExpiresIn: undefined,
    },
  };
};

export const InitiateAuth =
  (services: InitiateAuthServices): InitiateAuthTarget =>
  async (ctx, req) => {
    const userPool = await services.cognito.getUserPoolForClientId(
      ctx,
      req.ClientId
    );

    if (req.AuthFlow === "USER_PASSWORD_AUTH") {
      return userPasswordAuthFlow(ctx, req, userPool, services);
    } else if (
      req.AuthFlow === "REFRESH_TOKEN" ||
      req.AuthFlow === "REFRESH_TOKEN_AUTH"
    ) {
      return refreshTokenAuthFlow(ctx, req, services);
    } else {
      throw new UnsupportedError(`InitAuth with AuthFlow=${req.AuthFlow}`);
    }
  };
