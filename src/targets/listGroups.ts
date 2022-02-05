import {
  ListGroupsRequest,
  ListGroupsResponse,
} from "aws-sdk/clients/cognitoidentityserviceprovider";
import { ResourceNotFoundError } from "../errors";
import { Services } from "../services";
import { Target } from "../server/Router";

export type ListGroupsTarget = Target<ListGroupsRequest, ListGroupsResponse>;

type ListGroupServices = Pick<Services, "cognito">;

export const ListGroups =
  ({ cognito }: ListGroupServices): ListGroupsTarget =>
  async (ctx, req) => {
    // TODO: Limit support
    // TODO: PaginationToken support

    const userPool = await cognito.getUserPool(ctx, req.UserPoolId);

    if (!userPool) {
      throw new ResourceNotFoundError();
    }

    const groups = await userPool.listGroups(ctx);

    return {
      Groups: groups.map((group) => ({
        CreationDate: group.CreationDate,
        Description: group.Description,
        GroupName: group.GroupName,
        LastModifiedDate: group.LastModifiedDate,
        Precedence: group.Precedence,
        RoleArn: group.RoleArn,
        UserPoolId: req.UserPoolId,
      })),
    };
  };
