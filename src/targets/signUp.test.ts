import { DateClock } from "../services/clock";
import { MockCognitoService } from "../mocks/MockCognitoService";
import { MockMessages } from "../mocks/MockMessages";
import { MockTriggers } from "../mocks/MockTriggers";
import { MockUserPoolService } from "../mocks/MockUserPoolService";
import { UUID } from "../models";
import { MockContext } from "../mocks/MockContext";

import {
  InvalidParameterError,
  UserLambdaValidationError,
  UsernameExistsError,
} from "../errors";
import { Messages, Triggers, UserPoolService } from "../services";
import { SignUp, SignUpTarget } from "./signUp";
import { MockUser } from "../models/UserModel";

describe("SignUp target", () => {
  let signUp: SignUpTarget;
  let mockUserPoolService: jest.Mocked<UserPoolService>;
  let mockMessages: jest.Mocked<Messages>;
  let mockOtp: jest.MockedFunction<() => string>;
  let mockTriggers: jest.Mocked<Triggers>;
  let now: Date;

  beforeEach(() => {
    now = new Date(2020, 1, 2, 3, 4, 5);

    mockUserPoolService = MockUserPoolService();
    mockMessages = MockMessages();
    mockOtp = jest.fn();
    mockTriggers = MockTriggers();
    signUp = SignUp({
      cognito: MockCognitoService(mockUserPoolService),
      clock: new DateClock(now),
      messages: mockMessages,
      otp: mockOtp,
      triggers: mockTriggers,
    });
  });

  it("throws if user already exists", async () => {
    const user = MockUser();

    mockUserPoolService.getUserByUsername.mockResolvedValue(user);

    await expect(
      signUp(MockContext, {
        ClientId: "clientId",
        Password: "pwd",
        Username: user.Username,
        UserAttributes: [],
      })
    ).rejects.toBeInstanceOf(UsernameExistsError);
  });

  it("saves a new user", async () => {
    mockUserPoolService.getUserByUsername.mockResolvedValue(null);

    await signUp(MockContext, {
      ClientId: "clientId",
      Password: "pwd",
      Username: "user-supplied",
      UserAttributes: [{ Name: "email", Value: "example@example.com" }],
    });

    expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(MockContext, {
      Attributes: [
        {
          Name: "sub",
          Value: expect.stringMatching(UUID),
        },
        { Name: "email", Value: "example@example.com" },
      ],
      Enabled: true,
      Password: "pwd",
      UserCreateDate: now,
      UserLastModifiedDate: now,
      UserStatus: "UNCONFIRMED",
      Username: "user-supplied",
      RefreshTokens: [],
    });
  });

  describe("when PreSignUp trigger is enabled", () => {
    beforeEach(() => {
      mockTriggers.enabled.mockImplementation(
        (trigger) => trigger === "PreSignUp"
      );
    });

    it("calls the trigger lambda", async () => {
      mockUserPoolService.getUserByUsername.mockResolvedValue(null);
      mockTriggers.preSignUp.mockResolvedValue({
        autoConfirmUser: false,
        autoVerifyPhone: false,
        autoVerifyEmail: false,
      });

      await signUp(MockContext, {
        ClientId: "clientId",
        ClientMetadata: {
          client: "metadata",
        },
        Password: "pwd",
        Username: "user-supplied",
        UserAttributes: [{ Name: "email", Value: "example@example.com" }],
        ValidationData: [{ Name: "another", Value: "attribute" }],
      });

      expect(mockTriggers.preSignUp).toHaveBeenCalledWith(MockContext, {
        clientId: "clientId",
        clientMetadata: {
          client: "metadata",
        },
        source: "PreSignUp_SignUp",
        userAttributes: [
          { Name: "sub", Value: expect.stringMatching(UUID) },
          { Name: "email", Value: "example@example.com" },
        ],
        userPoolId: "test",
        username: "user-supplied",
        validationData: undefined,
      });
    });

    it("throws if the trigger lambda fails", async () => {
      mockUserPoolService.getUserByUsername.mockResolvedValue(null);
      mockTriggers.preSignUp.mockRejectedValue(new UserLambdaValidationError());

      await expect(
        signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "email", Value: "example@example.com" }],
          ValidationData: [{ Name: "another", Value: "attribute" }],
        })
      ).rejects.toBeInstanceOf(UserLambdaValidationError);
    });

    describe("autoConfirmUser=true", () => {
      beforeEach(() => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);
        mockTriggers.preSignUp.mockResolvedValue({
          autoConfirmUser: true,
          autoVerifyPhone: false,
          autoVerifyEmail: false,
        });
      });

      it("confirms the user", async () => {
        await signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "email", Value: "example@example.com" }],
          ValidationData: [{ Name: "another", Value: "attribute" }],
        });

        expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(
          MockContext,
          expect.objectContaining({
            UserStatus: "CONFIRMED",
          })
        );
      });

      describe("when PostConfirmation trigger is enabled", () => {
        beforeEach(() => {
          mockTriggers.enabled.mockImplementation(
            (trigger) =>
              trigger === "PreSignUp" || trigger === "PostConfirmation"
          );
        });

        it("calls the PostConfirmation trigger lambda", async () => {
          await signUp(MockContext, {
            ClientId: "clientId",
            ClientMetadata: {
              client: "metadata",
            },
            Password: "pwd",
            Username: "user-supplied",
            UserAttributes: [{ Name: "email", Value: "example@example.com" }],
            ValidationData: [{ Name: "another", Value: "attribute" }],
          });

          expect(mockTriggers.postConfirmation).toHaveBeenCalledWith(
            MockContext,
            {
              clientId: "clientId",
              clientMetadata: {
                client: "metadata",
              },
              source: "PostConfirmation_ConfirmSignUp",
              userAttributes: [
                { Name: "sub", Value: expect.stringMatching(UUID) },
                { Name: "email", Value: "example@example.com" },
                { Name: "cognito:user_status", Value: "CONFIRMED" },
              ],
              userPoolId: "test",
              username: "user-supplied",
              validationData: undefined,
            }
          );
        });

        it("throws if the PostConfirmation lambda fails", async () => {
          mockUserPoolService.getUserByUsername.mockResolvedValue(null);
          mockTriggers.postConfirmation.mockRejectedValue(
            new UserLambdaValidationError()
          );

          await expect(
            signUp(MockContext, {
              ClientId: "clientId",
              ClientMetadata: {
                client: "metadata",
              },
              Password: "pwd",
              Username: "user-supplied",
              UserAttributes: [{ Name: "email", Value: "example@example.com" }],
              ValidationData: [{ Name: "another", Value: "attribute" }],
            })
          ).rejects.toBeInstanceOf(UserLambdaValidationError);
        });
      });
    });

    describe("autoConfirmUser=false", () => {
      beforeEach(() => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);
        mockTriggers.preSignUp.mockResolvedValue({
          autoConfirmUser: false,
          autoVerifyPhone: false,
          autoVerifyEmail: false,
        });
      });

      it("does not confirm the user", async () => {
        await signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "email", Value: "example@example.com" }],
          ValidationData: [{ Name: "another", Value: "attribute" }],
        });

        expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(
          MockContext,
          expect.objectContaining({
            UserStatus: "UNCONFIRMED",
          })
        );
      });

      it("does not call the PostConfirmation trigger lambda", async () => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);

        await signUp(MockContext, {
          ClientId: "clientId",
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "email", Value: "example@example.com" }],
        });

        expect(mockTriggers.postConfirmation).not.toHaveBeenCalled();
      });
    });

    it("verifies the user's email if the lambda returns autoVerifyEmail=true and the user has an email attribute", async () => {
      mockUserPoolService.getUserByUsername.mockResolvedValue(null);
      mockTriggers.preSignUp.mockResolvedValue({
        autoConfirmUser: false,
        autoVerifyEmail: true,
        autoVerifyPhone: false,
      });

      await signUp(MockContext, {
        ClientId: "clientId",
        ClientMetadata: {
          client: "metadata",
        },
        Password: "pwd",
        Username: "user-supplied",
        UserAttributes: [{ Name: "email", Value: "example@example.com" }],
        ValidationData: [{ Name: "another", Value: "attribute" }],
      });

      expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(
        MockContext,
        expect.objectContaining({
          Attributes: [
            { Name: "sub", Value: expect.stringMatching(UUID) },
            { Name: "email", Value: "example@example.com" },
            { Name: "email_verified", Value: "true" },
          ],
        })
      );
    });

    it("does not verify the user's email if the lambda returns autoVerifyEmail=true but the user does not have an email attribute", async () => {
      mockUserPoolService.getUserByUsername.mockResolvedValue(null);
      mockTriggers.preSignUp.mockResolvedValue({
        autoConfirmUser: false,
        autoVerifyPhone: false,
        autoVerifyEmail: true,
      });

      await signUp(MockContext, {
        ClientId: "clientId",
        ClientMetadata: {
          client: "metadata",
        },
        Password: "pwd",
        Username: "user-supplied",
        UserAttributes: [],
        ValidationData: [{ Name: "another", Value: "attribute" }],
      });

      expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(
        MockContext,
        expect.objectContaining({
          Attributes: [{ Name: "sub", Value: expect.stringMatching(UUID) }],
        })
      );
    });

    it("verifies the user's phone_number if the lambda returns autoVerifyPhone=true and the user has an phone_number attribute", async () => {
      mockUserPoolService.getUserByUsername.mockResolvedValue(null);
      mockTriggers.preSignUp.mockResolvedValue({
        autoConfirmUser: false,
        autoVerifyPhone: true,
        autoVerifyEmail: false,
      });

      await signUp(MockContext, {
        ClientId: "clientId",
        ClientMetadata: {
          client: "metadata",
        },
        Password: "pwd",
        Username: "user-supplied",
        UserAttributes: [{ Name: "phone_number", Value: "0400000000" }],
        ValidationData: [{ Name: "another", Value: "attribute" }],
      });

      expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(
        MockContext,
        expect.objectContaining({
          Attributes: [
            { Name: "sub", Value: expect.stringMatching(UUID) },
            { Name: "phone_number", Value: "0400000000" },
            { Name: "phone_number_verified", Value: "true" },
          ],
        })
      );
    });

    it("does not verify the user's phone_number if the lambda returns autoVerifyPhone=true but the user does not have a phone_number attribute", async () => {
      mockUserPoolService.getUserByUsername.mockResolvedValue(null);
      mockTriggers.preSignUp.mockResolvedValue({
        autoConfirmUser: false,
        autoVerifyPhone: true,
        autoVerifyEmail: false,
      });

      await signUp(MockContext, {
        ClientId: "clientId",
        ClientMetadata: {
          client: "metadata",
        },
        Password: "pwd",
        Username: "user-supplied",
        UserAttributes: [],
        ValidationData: [{ Name: "another", Value: "attribute" }],
      });

      expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(
        MockContext,
        expect.objectContaining({
          Attributes: [{ Name: "sub", Value: expect.stringMatching(UUID) }],
        })
      );
    });
  });

  describe("when PreSignUp trigger is disabled", () => {
    it("does not call the trigger lambda", async () => {
      mockUserPoolService.getUserByUsername.mockResolvedValue(null);

      await signUp(MockContext, {
        ClientId: "clientId",
        Password: "pwd",
        Username: "user-supplied",
        UserAttributes: [{ Name: "email", Value: "example@example.com" }],
      });

      expect(mockTriggers.preSignUp).not.toHaveBeenCalled();
    });
  });

  describe("messages", () => {
    describe("UserPool.AutoVerifiedAttributes=default", () => {
      beforeEach(() => {
        mockUserPoolService.config.AutoVerifiedAttributes = undefined;
      });

      it("does not send a confirmation code", async () => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);
        mockOtp.mockReturnValue("1234");

        await signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "email", Value: "example@example.com" }],
        });

        expect(mockMessages.deliver).not.toHaveBeenCalled();
      });
    });

    describe("UserPool.AutoVerifiedAttributes=email", () => {
      beforeEach(() => {
        mockUserPoolService.config.AutoVerifiedAttributes = ["email"];
      });

      it("sends a confirmation code to the user's email address", async () => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);
        mockOtp.mockReturnValue("1234");

        await signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "email", Value: "example@example.com" }],
        });

        const createdUser = {
          Attributes: [
            { Name: "sub", Value: expect.stringMatching(UUID) },
            { Name: "email", Value: "example@example.com" },
          ],
          Enabled: true,
          Password: "pwd",
          UserCreateDate: now,
          UserLastModifiedDate: now,
          UserStatus: "UNCONFIRMED",
          Username: "user-supplied",
          RefreshTokens: [],
        };

        expect(mockMessages.deliver).toHaveBeenCalledWith(
          MockContext,
          "SignUp",
          "clientId",
          "test",
          createdUser,
          "1234",
          {
            client: "metadata",
          },
          {
            AttributeName: "email",
            DeliveryMedium: "EMAIL",
            Destination: "example@example.com",
          }
        );
      });

      it("fails if user doesn't have an email", async () => {
        await expect(
          signUp(MockContext, {
            ClientId: "clientId",
            Password: "pwd",
            Username: "user-supplied",
            UserAttributes: [],
          })
        ).rejects.toEqual(
          new InvalidParameterError(
            "User has no attribute matching desired auto verified attributes"
          )
        );

        expect(mockMessages.deliver).not.toHaveBeenCalled();
      });
    });

    describe("UserPool.AutoVerifiedAttributes=phone_number", () => {
      beforeEach(() => {
        mockUserPoolService.config.AutoVerifiedAttributes = ["phone_number"];
      });

      it("sends a confirmation code to the user's phone number", async () => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);
        mockOtp.mockReturnValue("1234");

        await signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "phone_number", Value: "0400000000" }],
        });

        const createdUser = {
          Attributes: [
            { Name: "sub", Value: expect.stringMatching(UUID) },
            { Name: "phone_number", Value: "0400000000" },
          ],
          Enabled: true,
          Password: "pwd",
          UserCreateDate: now,
          UserLastModifiedDate: now,
          UserStatus: "UNCONFIRMED",
          Username: "user-supplied",
          RefreshTokens: [],
        };

        expect(mockMessages.deliver).toHaveBeenCalledWith(
          MockContext,
          "SignUp",
          "clientId",
          "test",
          createdUser,
          "1234",
          {
            client: "metadata",
          },
          {
            AttributeName: "phone_number",
            DeliveryMedium: "SMS",
            Destination: "0400000000",
          }
        );
      });

      it("fails if user doesn't have a phone_number", async () => {
        await expect(
          signUp(MockContext, {
            ClientId: "clientId",
            Password: "pwd",
            Username: "user-supplied",
            UserAttributes: [],
          })
        ).rejects.toEqual(
          new InvalidParameterError(
            "User has no attribute matching desired auto verified attributes"
          )
        );

        expect(mockMessages.deliver).not.toHaveBeenCalled();
      });
    });

    describe("UserPool.AutoVerifiedAttributes=phone_number and email", () => {
      beforeEach(() => {
        mockUserPoolService.config.AutoVerifiedAttributes = [
          "email",
          "phone_number",
        ];
      });

      it("sends a confirmation code to the user's phone number if they have both attributes", async () => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);
        mockOtp.mockReturnValue("1234");

        await signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [
            { Name: "email", Value: "example@example.com" },
            { Name: "phone_number", Value: "0400000000" },
          ],
        });

        const createdUser = {
          Attributes: [
            { Name: "sub", Value: expect.stringMatching(UUID) },
            { Name: "email", Value: "example@example.com" },
            { Name: "phone_number", Value: "0400000000" },
          ],
          Enabled: true,
          Password: "pwd",
          UserCreateDate: now,
          UserLastModifiedDate: now,
          UserStatus: "UNCONFIRMED",
          Username: "user-supplied",
          RefreshTokens: [],
        };

        expect(mockMessages.deliver).toHaveBeenCalledWith(
          MockContext,
          "SignUp",
          "clientId",
          "test",
          createdUser,
          "1234",
          {
            client: "metadata",
          },
          {
            AttributeName: "phone_number",
            DeliveryMedium: "SMS",
            Destination: "0400000000",
          }
        );
      });

      it("sends a confirmation code to the user's email if they only have an email", async () => {
        mockUserPoolService.getUserByUsername.mockResolvedValue(null);
        mockOtp.mockReturnValue("1234");

        await signUp(MockContext, {
          ClientId: "clientId",
          ClientMetadata: {
            client: "metadata",
          },
          Password: "pwd",
          Username: "user-supplied",
          UserAttributes: [{ Name: "email", Value: "example@example.com" }],
        });

        const createdUser = {
          Attributes: [
            { Name: "sub", Value: expect.stringMatching(UUID) },
            { Name: "email", Value: "example@example.com" },
          ],
          Enabled: true,
          Password: "pwd",
          UserCreateDate: now,
          UserLastModifiedDate: now,
          UserStatus: "UNCONFIRMED",
          Username: "user-supplied",
          RefreshTokens: [],
        };

        expect(mockMessages.deliver).toHaveBeenCalledWith(
          MockContext,
          "SignUp",
          "clientId",
          "test",
          createdUser,
          "1234",
          {
            client: "metadata",
          },
          {
            AttributeName: "email",
            DeliveryMedium: "EMAIL",
            Destination: "example@example.com",
          }
        );
      });

      it("fails if user doesn't have a phone_number or an email", async () => {
        await expect(
          signUp(MockContext, {
            ClientId: "clientId",
            Password: "pwd",
            Username: "user-supplied",
            UserAttributes: [],
          })
        ).rejects.toEqual(
          new InvalidParameterError(
            "User has no attribute matching desired auto verified attributes"
          )
        );

        expect(mockMessages.deliver).not.toHaveBeenCalled();
      });
    });
  });

  it("saves the confirmation code on the user for comparison when confirming", async () => {
    mockUserPoolService.getUserByUsername.mockResolvedValue(null);
    mockOtp.mockReturnValue("1234");

    await signUp(MockContext, {
      ClientId: "clientId",
      Password: "pwd",
      Username: "user-supplied",
      UserAttributes: [{ Name: "email", Value: "example@example.com" }],
    });

    expect(mockUserPoolService.saveUser).toHaveBeenCalledWith(MockContext, {
      Attributes: [
        { Name: "sub", Value: expect.stringMatching(UUID) },
        { Name: "email", Value: "example@example.com" },
      ],
      ConfirmationCode: "1234",
      Enabled: true,
      Password: "pwd",
      UserCreateDate: now,
      UserLastModifiedDate: now,
      UserStatus: "UNCONFIRMED",
      Username: "user-supplied",
      RefreshTokens: [],
    });
  });
});
