import {
  AdminDeleteUserAttributesRequest,
  AdminDeleteUserAttributesResponse,
} from "aws-sdk/clients/cognitoidentityserviceprovider";
import { NotAuthorizedError, ResourceNotFoundError } from "../errors";
import { Services } from "../services";
import { attributesRemove } from "../services/userPoolService";
import { Target } from "./Target";

export type AdminDeleteUserAttributesTarget = Target<
  AdminDeleteUserAttributesRequest,
  AdminDeleteUserAttributesResponse
>;

type AdminDeleteUserAttributesServices = Pick<Services, "clock" | "cognito">;

export const AdminDeleteUserAttributes =
  ({
    clock,
    cognito,
  }: AdminDeleteUserAttributesServices): AdminDeleteUserAttributesTarget =>
  async (ctx, req) => {
    const userPool = await cognito.getUserPool(ctx, req.UserPoolId);

    if (!userPool) {
      throw new ResourceNotFoundError();
    }

    const user = await userPool.getUserByUsername(ctx, req.Username);
    if (!user) {
      throw new NotAuthorizedError();
    }

    const updatedUser = {
      ...user,
      Attributes: attributesRemove(user.Attributes, ...req.UserAttributeNames),
      UserLastModifiedDate: clock.get(),
    };

    await userPool.saveUser(ctx, updatedUser);

    return {};
  };
