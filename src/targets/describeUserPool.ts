import {
  DescribeUserPoolRequest,
  DescribeUserPoolResponse,
} from "aws-sdk/clients/cognitoidentityserviceprovider";
import { ResourceNotFoundError } from "../errors";
import { Services } from "../services";
import { Target } from "./Target";

export type DescribeUserPoolTarget = Target<
  DescribeUserPoolRequest,
  DescribeUserPoolResponse
>;

export const DescribeUserPool =
  ({
    cognito,
    clock,
  }: Pick<Services, "clock" | "cognito">): DescribeUserPoolTarget =>
  async (ctx, req) => {
    const userPool = await cognito.getUserPool(ctx, req.UserPoolId);

    if (!userPool) {
      throw new ResourceNotFoundError(
        `User pool ${req.UserPoolId} does not exist.`
      );
    }

    const now = clock.get();

    return {
      UserPool: {
        ...userPool.config,
        CreationDate: now,
        LastModifiedDate: now,
      },
    };
  };
