import {
  ListUsersRequest,
  ListUsersResponse,
} from "aws-sdk/clients/cognitoidentityserviceprovider";
import { Services } from "../services";
import { Target } from "./Target";
import { ResourceNotFoundError } from "../errors";

export type ListUsersTarget = Target<ListUsersRequest, ListUsersResponse>;

export const ListUsers =
  ({ cognito }: Pick<Services, "cognito">): ListUsersTarget =>
  async (ctx, req) => {
    const userPool = await cognito.getUserPool(ctx, req.UserPoolId);

    if (!userPool) {
      throw new ResourceNotFoundError();
    }

    const users = await userPool.listUsers(ctx);

    // TODO: support AttributesToGet
    // TODO: support Filter
    // TODO: support Limit
    // TODO: support PaginationToken

    return {
      Users: users.map((user) => ({
        Username: user.Username,
        UserCreateDate: user.UserCreateDate,
        UserLastModifiedDate: user.UserLastModifiedDate,
        Enabled: user.Enabled,
        UserStatus: user.UserStatus,
        Attributes: user.Attributes,
      })),
    };
  };
