import {
  AttributeListType,
  AttributeType,
  MFAOptionListType,
  SchemaAttributesListType,
  UserPoolType,
  UserStatusType,
} from "aws-sdk/clients/cognitoidentityserviceprovider";
import { InvalidParameterError } from "../errors";
import { AppClient, newId } from "./appClient";
import { Clock } from "./clock";
import { Context } from "./context";
import { DataStore } from "./dataStore/dataStore";
import { DataStoreFactory } from "./dataStore/factory";
import { Group } from "../contracts/Group";

export interface MFAOption {
  DeliveryMedium: "SMS";
  AttributeName: "phone_number";
}

export const attribute = (
  name: string,
  value: string | undefined
): AttributeType => ({ Name: name, Value: value });
export const attributesIncludeMatch = (
  attributeName: string,
  attributeValue: string,
  attributes: AttributeListType | undefined
) =>
  !!(attributes ?? []).find(
    (x) => x.Name === attributeName && x.Value === attributeValue
  );
export const attributesInclude = (
  attributeName: string,
  attributes: AttributeListType | undefined
) => !!(attributes ?? []).find((x) => x.Name === attributeName);
export const attributeValue = (
  attributeName: string | undefined,
  attributes: AttributeListType | undefined
) => (attributes ?? []).find((x) => x.Name === attributeName)?.Value;
export const attributesToRecord = (
  attributes: AttributeListType | undefined
): Record<string, string> =>
  (attributes ?? []).reduce(
    (acc, attr) => ({ ...acc, [attr.Name]: attr.Value }),
    {}
  );
export const attributesFromRecord = (
  attributes: Record<string, string>
): AttributeListType =>
  Object.entries(attributes).map(([Name, Value]) => ({ Name, Value }));
export const attributesAppend = (
  attributes: AttributeListType | undefined,
  ...toAppend: AttributeListType
): AttributeListType => {
  const attributeSet = attributesToRecord(attributes);

  for (const attr of toAppend) {
    if (attr.Value) {
      attributeSet[attr.Name] = attr.Value;
    } else {
      delete attributeSet[attr.Name];
    }
  }

  return attributesFromRecord(attributeSet);
};

export const attributesRemove = (
  attributes: AttributeListType | undefined,
  ...toRemove: readonly string[]
): AttributeListType =>
  attributes?.filter((x) => !toRemove.includes(x.Name)) ?? [];

export const customAttributes = (
  attributes: AttributeListType | undefined
): AttributeListType =>
  (attributes ?? []).filter((attr) => attr.Name.startsWith("custom:"));

export interface User {
  Username: string;
  UserCreateDate: Date;
  UserLastModifiedDate: Date;
  Enabled: boolean;
  UserStatus: UserStatusType;
  Attributes: AttributeListType;
  MFAOptions?: MFAOptionListType;

  // extra attributes for Cognito Local
  Password: string;
  AttributeVerificationCode?: string;
  ConfirmationCode?: string;
  MFACode?: string;
  RefreshTokens: string[];
}

// just use the types from the sdk, but make Id required
export type UserPool = UserPoolType & {
  Id: string;
};

export interface UserPoolService {
  readonly config: UserPool;

  createAppClient(ctx: Context, name: string): Promise<AppClient>;
  deleteUser(ctx: Context, user: User): Promise<void>;
  getUserByUsername(ctx: Context, username: string): Promise<User | null>;
  getUserByRefreshToken(
    ctx: Context,
    refreshToken: string
  ): Promise<User | null>;
  listGroups(ctx: Context): Promise<readonly Group[]>;
  listUsers(ctx: Context): Promise<readonly User[]>;
  saveGroup(ctx: Context, group: Group): Promise<void>;
  saveUser(ctx: Context, user: User): Promise<void>;
  storeRefreshToken(
    ctx: Context,
    refreshToken: string,
    user: User
  ): Promise<void>;
}

export interface UserPoolServiceFactory {
  create(
    ctx: Context,
    clientsDataStore: DataStore,
    defaultOptions: UserPool
  ): Promise<UserPoolService>;

  get(
    ctx: Context,
    userPoolId: string,
    clientsDataStore: DataStore
  ): Promise<UserPoolService | null>;

  delete(ctx: Context, userPool: UserPool): boolean;
}

export class UserPoolServiceImpl implements UserPoolService {
  private readonly clientsDataStore: DataStore;
  private readonly clock: Clock;
  private readonly dataStore: DataStore;

  public readonly config: UserPool;

  public constructor(
    clientsDataStore: DataStore,
    clock: Clock,
    dataStore: DataStore,
    config: UserPool
  ) {
    this.clientsDataStore = clientsDataStore;
    this.config = config;
    this.clock = clock;
    this.dataStore = dataStore;
  }

  public async createAppClient(ctx: Context, name: string): Promise<AppClient> {
    ctx.logger.debug({ name }, "UserPoolServiceImpl.createAppClient");
    const id = newId();
    const now = this.clock.get();

    const appClient: AppClient = {
      ClientId: id,
      ClientName: name,
      UserPoolId: this.config.Id,
      CreationDate: now,
      LastModifiedDate: now,
      AllowedOAuthFlowsUserPoolClient: false,
      RefreshTokenValidity: 30,
    };

    await this.clientsDataStore.set(ctx, ["Clients", id], appClient);

    return appClient;
  }

  public async deleteUser(ctx: Context, user: User): Promise<void> {
    ctx.logger.debug(
      { username: user.Username },
      "UserPoolServiceImpl.deleteUser"
    );
    await this.dataStore.delete(ctx, ["Users", user.Username]);
  }

  public async getUserByUsername(
    ctx: Context,
    username: string
  ): Promise<User | null> {
    ctx.logger.debug({ username }, "UserPoolServiceImpl.getUserByUsername");

    const aliasEmailEnabled = this.config.UsernameAttributes?.includes("email");
    const aliasPhoneNumberEnabled =
      this.config.UsernameAttributes?.includes("phone_number");

    const userByUsername = await this.dataStore.get<User>(ctx, [
      "Users",
      username,
    ]);
    if (userByUsername) {
      return userByUsername;
    }

    const users = await this.dataStore.get<Record<string, User>>(
      ctx,
      "Users",
      {}
    );

    for (const user of Object.values(users)) {
      if (attributesIncludeMatch("sub", username, user.Attributes)) {
        return user;
      }

      if (
        aliasEmailEnabled &&
        attributesIncludeMatch("email", username, user.Attributes)
      ) {
        return user;
      }

      if (
        aliasPhoneNumberEnabled &&
        attributesIncludeMatch("phone_number", username, user.Attributes)
      ) {
        return user;
      }
    }

    return null;
  }

  public async getUserByRefreshToken(
    ctx: Context,
    refreshToken: string
  ): Promise<User | null> {
    ctx.logger.debug(
      { refreshToken },
      "UserPoolServiceImpl.getUserByRefreshToken"
    );
    const users = await this.listUsers(ctx);
    const user = users.find(
      (user) =>
        Array.isArray(user.RefreshTokens) &&
        user.RefreshTokens.includes(refreshToken)
    );

    return user ?? null;
  }

  public async listUsers(ctx: Context): Promise<readonly User[]> {
    ctx.logger.debug("UserPoolServiceImpl.listUsers");
    const users = await this.dataStore.get<Record<string, User>>(
      ctx,
      "Users",
      {}
    );

    return Object.values(users);
  }

  public async saveUser(ctx: Context, user: User): Promise<void> {
    ctx.logger.debug({ user }, "UserPoolServiceImpl.saveUser");

    await this.dataStore.set<User>(ctx, ["Users", user.Username], user);
  }

  async listGroups(ctx: Context): Promise<readonly Group[]> {
    ctx.logger.debug("UserPoolServiceImpl.listGroups");
    const groups = await this.dataStore.get<Record<string, Group>>(
      ctx,
      "Groups",
      {}
    );

    return Object.values(groups);
  }

  async saveGroup(ctx: Context, group: Group): Promise<void> {
    ctx.logger.debug({ group }, "UserPoolServiceImpl.saveGroup");

    await this.dataStore.set<Group>(ctx, ["Groups", group.GroupName], group);
  }

  async storeRefreshToken(
    ctx: Context,
    refreshToken: string,
    user: User
  ): Promise<void> {
    ctx.logger.debug(
      { refreshToken, username: user.Username },
      "UserPoolServiceImpl.storeRefreshToken",
      refreshToken
    );
    const refreshTokens = Array.isArray(user.RefreshTokens)
      ? user.RefreshTokens
      : [];
    refreshTokens.push(refreshToken);

    await this.saveUser(ctx, {
      ...user,
      RefreshTokens: refreshTokens,
    });
  }
}

export class UserPoolServiceFactoryImpl implements UserPoolServiceFactory {
  private readonly clock: Clock;
  private readonly dataStoreFactory: DataStoreFactory;

  public constructor(clock: Clock, dataStoreFactory: DataStoreFactory) {
    this.clock = clock;
    this.dataStoreFactory = dataStoreFactory;
  }

  public async create(
    ctx: Context,
    clientsDataStore: DataStore,
    defaultOptions: UserPool
  ): Promise<UserPoolService> {
    const id = defaultOptions.Id;

    ctx.logger.debug({ id }, "UserPoolServiceFactoryImpl.create");

    const dataStore = await this.dataStoreFactory.create(ctx, id, {
      Users: {},
      Options: defaultOptions,
    });

    const config = await dataStore.get<UserPool>(
      ctx,
      "Options",
      defaultOptions
    );

    return new UserPoolServiceImpl(
      clientsDataStore,
      this.clock,
      dataStore,
      config
    );
  }

  public async get(
    ctx: Context,
    userPoolId: string,
    clientsDataStore: DataStore
  ): Promise<UserPoolService | null> {
    ctx.logger.debug(
      { id: userPoolId },
      `UserPoolServiceFactoryImpl.get(${userPoolId})`
    );

    const dataStore = this.dataStoreFactory.get(ctx, userPoolId);

    if (!dataStore) {
      return null;
    }

    //  NOTE: If this type guard a good idea, I'm just trying to prevent warnings from typescript about using nulls
    const config = (await dataStore.get<UserPool>(ctx, "Options")) as UserPool;

    return new UserPoolServiceImpl(
      clientsDataStore,
      this.clock,
      dataStore,
      config
    );
  }

  public delete(ctx: Context, userPool: UserPool): boolean {
    ctx.logger.debug(
      { id: userPool.Id },
      `UserPoolServiceFactoryImpl.delete(${userPool.Id})`
    );

    const dataStore = this.dataStoreFactory.get(ctx, userPool.Id);

    if (!dataStore) {
      return false;
    }

    return this.dataStoreFactory.delete(ctx, userPool.Id);
  }
}

export const validatePermittedAttributeChanges = (
  requestAttributes: AttributeListType,
  schemaAttributes: SchemaAttributesListType
): AttributeListType => {
  for (const attr of requestAttributes) {
    const attrSchema = schemaAttributes.find((x) => x.Name === attr.Name);
    if (!attrSchema) {
      throw new InvalidParameterError(
        `user.${attr.Name}: Attribute does not exist in the schema.`
      );
    }
    if (!attrSchema.Mutable) {
      throw new InvalidParameterError(
        `user.${attr.Name}: Attribute cannot be updated. (changing an immutable attribute)`
      );
    }
  }

  if (
    attributesInclude("email_verified", requestAttributes) &&
    !attributesInclude("email", requestAttributes)
  ) {
    throw new InvalidParameterError(
      "Email is required to verify/un-verify an email"
    );
  }

  if (
    attributesInclude("phone_number_verified", requestAttributes) &&
    !attributesInclude("phone_number", requestAttributes)
  ) {
    throw new InvalidParameterError(
      "Phone Number is required to verify/un-verify a phone number"
    );
  }

  return requestAttributes;
};

export const defaultVerifiedAttributesIfModified = (
  attributes: AttributeListType
): AttributeListType => {
  const attributesToSet = [...attributes];
  if (
    attributesInclude("email", attributes) &&
    !attributesInclude("email_verified", attributes)
  ) {
    attributesToSet.push(attribute("email_verified", "false"));
  }
  if (
    attributesInclude("phone_number", attributes) &&
    !attributesInclude("phone_number_verified", attributes)
  ) {
    attributesToSet.push(attribute("phone_number_verified", "false"));
  }
  return attributesToSet;
};

export const hasUnverifiedContactAttributes = (
  userAttributesToSet: AttributeListType
): boolean =>
  attributeValue("email_verified", userAttributesToSet) === "false" ||
  attributeValue("phone_number_verified", userAttributesToSet) === "false";
