import { Context } from "../services/context";

import { AdminDeleteUserAttributes } from "./adminDeleteUserAttributes";
import { AdminSetUserPassword } from "./adminSetUserPassword";
import { ConfirmForgotPassword } from "./confirmForgotPassword";
import { ConfirmSignUp } from "./confirmSignUp";
import { CreateGroup } from "./createGroup";
import { CreateUserPool } from "./createUserPool";
import { CreateUserPoolClient } from "./createUserPoolClient";
import { DeleteUser } from "./deleteUser";
import { DeleteUserAttributes } from "./deleteUserAttributes";
import { DeleteUserPool } from "./deleteUserPool";
import { DeleteUserPoolClient } from "./deleteUserPoolClient";
import { DescribeUserPool } from "./describeUserPool";
import { DescribeUserPoolClient } from "./describeUserPoolClient";
import { ForgotPassword } from "./forgotPassword";
import { ChangePassword } from "./changePassword";
import { GetUserAttributeVerificationCode } from "./getUserAttributeVerificationCode";
import { InitiateAuth } from "./initiateAuth";
import { ListGroups } from "./listGroups";
import { ListUserPools } from "./listUserPools";
import { ListUsers } from "./listUsers";
import { RespondToAuthChallenge } from "./respondToAuthChallenge";
import { SignUp } from "./signUp";
import { GetUser } from "./getUser";
import { GetUserPoolMfaConfig } from "./getUserPoolMfaConfig";
import { AdminCreateUser } from "./adminCreateUser";
import { AdminGetUser } from "./adminGetUser";
import { AdminDeleteUser } from "./adminDeleteUser";
import { AdminConfirmSignUp } from "./adminConfirmSignUp";
import { AdminUpdateUserAttributes } from "./adminUpdateUserAttributes";
import { AdminInitiateAuth } from "./adminInitiateAuth";
import { RevokeToken } from "./revokeToken";
import { UpdateUserAttributes } from "./updateUserAttributes";
import { VerifyUserAttribute } from "./verifyUserAttribute";

export const Targets = {
  AdminConfirmSignUp,
  AdminCreateUser,
  AdminDeleteUser,
  AdminDeleteUserAttributes,
  AdminGetUser,
  AdminInitiateAuth,
  AdminSetUserPassword,
  AdminUpdateUserAttributes,
  ChangePassword,
  ConfirmForgotPassword,
  ConfirmSignUp,
  CreateGroup,
  CreateUserPool,
  CreateUserPoolClient,
  DeleteUser,
  DeleteUserAttributes,
  DeleteUserPool,
  DeleteUserPoolClient,
  DescribeUserPool,
  DescribeUserPoolClient,
  ForgotPassword,
  GetUser,
  GetUserAttributeVerificationCode,
  GetUserPoolMfaConfig,
  InitiateAuth,
  ListGroups,
  ListUserPools,
  ListUsers,
  RespondToAuthChallenge,
  RevokeToken,
  SignUp,
  UpdateUserAttributes,
  VerifyUserAttribute,
} as const;

export type TargetName = keyof typeof Targets;

export type Target<Req extends {}, Res extends {}> = (
  ctx: Context,
  req: Req
) => Promise<Res>;

//export const registerTarget = (target: Target) => Targets
export const isSupportedTarget = (name: string): name is TargetName =>
  Object.keys(Targets).includes(name);