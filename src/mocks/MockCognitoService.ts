import { CognitoService, UserPoolService } from "../services";
import { CognitoServiceFactory } from "../services/cognitoService";
import { MockUserPoolService } from "./MockUserPoolService";

export const MockCognitoService = (
  userPoolClient: UserPoolService = MockUserPoolService()
): jest.Mocked<CognitoService> => ({
  createUserPool: jest.fn(),
  deleteUserPool: jest.fn(),
  getUserPool: jest.fn().mockResolvedValue(userPoolClient),
  getUserPoolForClientId: jest.fn().mockResolvedValue(userPoolClient),
  getAppClient: jest.fn(),
  deleteAppClient: jest.fn(),
  listUserPools: jest.fn(),
});

export const MockCognitoServiceFactory = (
  cognitoService: jest.Mocked<CognitoService> = MockCognitoService()
): jest.Mocked<CognitoServiceFactory> => ({
  create: jest.fn().mockResolvedValue(cognitoService),
});
