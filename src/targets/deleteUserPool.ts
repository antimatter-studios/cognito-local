import { DeleteUserPoolRequest } from "aws-sdk/clients/cognitoidentityserviceprovider";
import { ResourceNotFoundError } from "../errors";
import { Services } from "../services";
import { Target } from "./router";

export type DeleteUserPoolTarget = Target<DeleteUserPoolRequest, {}>;

export const DeleteUserPool =
  ({ cognito }: Pick<Services, "cognito">): DeleteUserPoolTarget =>
  async (ctx, req) => {
    const userPool = await cognito.getUserPool(ctx, req.UserPoolId);

    if (!userPool) {
      throw new ResourceNotFoundError();
    }

    const result = cognito.deleteUserPool(ctx, userPool.config);
    ctx.logger.debug({ haveResult: result });

    return {};
  };
