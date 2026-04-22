import type { IAuthenticatedUser, UserRole } from "../../src/auth/User";
import { DEMO_USERS } from "../../src/auth/InMemoryUserRepository";
import type { IAuthController } from "../../src/auth/AuthController";
import type { Express, Request, Response } from "express";
import request from "supertest";
import {
  signInAuthenticatedUser,
  type AppSessionStore,
} from "../../src/session/AppSession";
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

export class EventTestAuthController implements IAuthController {
  async showLogin(_req: Request, res: Response): Promise<void> {
    res.status(200).send("login");
  }

  async loginFromForm(req: Request, res: Response): Promise<void> {
    const role = req.body.role as UserRole | undefined;
    const user = role ? eventTestUsers[role] : null;
    if (!user) {
      res.status(400).send("unknown role");
      return;
    }

    signInAuthenticatedUser(req.session as AppSessionStore, user);
    res.redirect("/home");
  }

  async logoutFromForm(req: Request, res: Response): Promise<void> {
    req.session.destroy(() => res.redirect("/login"));
  }

  async showAdminUsers(_req: Request, res: Response): Promise<void> {
    res.status(200).send("admin users");
  }

  async createUserFromForm(_req: Request, res: Response): Promise<void> {
    res.status(201).send("created");
  }

  async deleteUserFromForm(_req: Request, res: Response): Promise<void> {
    res.status(204).send();
  }
}

export async function signInAs(
  app: Express,
  role: UserRole,
): Promise<request.Agent> {
  const agent = request.agent(app);
  await agent.post("/login").type("form").send({ role }).expect(302);
  return agent;
}
