import type { IAuthenticatedUser, UserRole } from "../../src/auth/User";
import { DEMO_USERS } from "../../src/auth/InMemoryUserRepository";
import type { ILoggingService } from "../../src/service/LoggingService";

function toAuthenticatedUser(role: UserRole): IAuthenticatedUser {
  const user = DEMO_USERS.find((candidate) => candidate.role === role);
  if (!user) {
    throw new Error(`Missing demo user for role ${role}.`);
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export const eventTestUsers: Record<UserRole, IAuthenticatedUser> = {
  admin: toAuthenticatedUser("admin"),
  staff: toAuthenticatedUser("staff"),
  user: toAuthenticatedUser("user"),
};

export function createSilentLogger(): jest.Mocked<ILoggingService> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}
