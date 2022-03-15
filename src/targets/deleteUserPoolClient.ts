import { DeleteUserPoolClientRequest } from "aws-sdk/clients/cognitoidentityserviceprovider";
import { ResourceNotFoundError } from "../errors";
import { Services } from "../services";
import { Target } from "./Target";

export type DeleteUserPoolTarget = Target<DeleteUserPoolClientRequest, {}>;

export const DeleteUserPoolClient =
  ({ cognito }: Pick<Services, "cognito">): DeleteUserPoolTarget =>
  async (ctx, req) => {
    const appClient = await cognito.getAppClient(ctx, req.ClientId);

    if (!appClient) {
      throw new ResourceNotFoundError();
    }

    await cognito.deleteAppClient(ctx, appClient);

    return {};
  };
