import {
  GetUserPoolMfaConfigRequest,
  GetUserPoolMfaConfigResponse,
} from "aws-sdk/clients/cognitoidentityserviceprovider";
import { ResourceNotFoundError } from "../errors";
import { Services } from "../services";
import { Target } from "./router";

export type GetUserPoolMfaConfigTarget = Target<
  GetUserPoolMfaConfigRequest,
  GetUserPoolMfaConfigResponse
>;

export const GetUserPoolMfaConfig =
  ({ cognito }: Pick<Services, "cognito">): GetUserPoolMfaConfigTarget =>
  async (ctx, req) => {
    ctx.logger.debug(`getUserPoolMfaConfig(${req.UserPoolId})`);

    const userPool = await cognito.getUserPool(ctx, req.UserPoolId);

    if (userPool?.config.Id !== req.UserPoolId) {
      throw new ResourceNotFoundError();
    }

    return {
      SmsMfaConfiguration: {
        SmsAuthenticationMessage: userPool.config.SmsVerificationMessage,
        SmsConfiguration: userPool.config.SmsConfiguration,
      },
      SoftwareTokenMfaConfiguration: {
        // TODO: I don't know where this value comes from
        Enabled: false,
      },
      MfaConfiguration: userPool.config.MfaConfiguration,
    };
  };
