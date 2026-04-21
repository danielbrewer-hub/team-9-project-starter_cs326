import type { Response } from "express";
import type { IAdminUserService } from "./AdminUserService";
import {
  getAuthenticatedUser,
  signInAuthenticatedUser,
  signOutAuthenticatedUser,
  touchAppSession,
  type IAppBrowserSession,
  type AppSessionStore,
} from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IAuthService } from "./AuthService";
import type { IUserSummary, UserRole } from "./User";
import type { AuthError } from "./errors";

export interface IAuthController {
  showLogin(res: Response, session: IAppBrowserSession, pageError?: string | null): Promise<void>;
  showAdminUsers(
    res: Response,
    session: IAppBrowserSession,
    pageError?: string | null,
  ): Promise<void>;
  loginFromForm(
    res: Response,
    email: string,
    password: string,
    store: AppSessionStore,
  ): Promise<void>;
  logoutFromForm(res: Response, store: AppSessionStore): Promise<void>;
  createUserFromForm(
    res: Response,
    input: { email: string; displayName: string; password: string; role: UserRole },
    session: IAppBrowserSession,
  ): Promise<void>;
  deleteUserFromForm(
    res: Response,
    userId: string,
    actingUserId: string,
    session: IAppBrowserSession,
  ): Promise<void>;
}

class AuthController implements IAuthController {
  constructor(
    private readonly service: IAuthService,
    private readonly adminUsers: IAdminUserService,
    private readonly logger: ILoggingService,
  ) {}

  private mapErrorStatus(error: AuthError): number {
    if (error.name === "InvalidCredentials") return 401;
    if (error.name === "AuthorizationRequired") return 403;
    if (error.name === "UserNotFound") return 404;
    if (error.name === "UserAlreadyExists") return 409;
    if (error.name === "ProtectedUserOperation") return 409;
    if (error.name === "ValidationError") return 400;
    return 500;
  }

  private async renderAdminUsersPage(
    res: Response,
    session: IAppBrowserSession,
    pageError: string | null = null,
  ): Promise<void> {
    const usersResult = await this.adminUsers.listUsers();

    if (usersResult.ok === false) {
      res.status(500).render("auth/users", {
        pageError: pageError ?? usersResult.value.message,
        session,
        users: [] as IUserSummary[],
      });
      return;
    }

    res.render("auth/users", {
      pageError,
      session,
      users: usersResult.value,
    });
  }

  async showLogin(
    res: Response,
    session: IAppBrowserSession,
    pageError: string | null = null,
  ): Promise<void> {
    res.render("auth/login", { pageError, session });
  }

  async showAdminUsers(
    res: Response,
    session: IAppBrowserSession,
    pageError: string | null = null,
  ): Promise<void> {
    await this.renderAdminUsersPage(res, session, pageError);
  }

  async loginFromForm(
    res: Response,
    email: string,
    password: string,
    store: AppSessionStore,
  ): Promise<void> {
    const session = touchAppSession(store);
    const result = await this.service.authenticate({ email, password });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Login failed: ${error.message}`);
      res.status(status);
      await this.showLogin(res, session, error.message);
      return;
    }

    const nextSession = signInAuthenticatedUser(store, result.value);
    this.logger.info(`Authenticated ${nextSession.authenticatedUser?.email ?? "unknown user"}`);
    res.redirect("/");
  }

  async logoutFromForm(res: Response, store: AppSessionStore): Promise<void> {
    const currentUser = getAuthenticatedUser(store);

    if (currentUser) {
      this.logger.info(`Signing out ${currentUser.email}`);
    }

    signOutAuthenticatedUser(store);
    res.redirect("/login");
  }

  async createUserFromForm(
    res: Response,
    input: { email: string; displayName: string; password: string; role: UserRole },
    session: IAppBrowserSession,
  ): Promise<void> {
    const result = await this.adminUsers.createUser(input);

    if (result.ok === false) {
      const status = this.mapErrorStatus(result.value);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Create user failed: ${result.value.message}`);
      res.status(status);
      await this.renderAdminUsersPage(res, session, result.value.message);
      return;
    }

    this.logger.info(`Created user ${result.value.email}`);
    res.redirect("/admin/users");
  }

  async deleteUserFromForm(
    res: Response,
    userId: string,
    actingUserId: string,
    session: IAppBrowserSession,
  ): Promise<void> {
    const result = await this.adminUsers.deleteUser(userId, actingUserId);

    if (result.ok === false) {
      const status = this.mapErrorStatus(result.value);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Delete user failed: ${result.value.message}`);
      res.status(status);
      await this.renderAdminUsersPage(res, session, result.value.message);
      return;
    }

    this.logger.info(`Deleted user ${userId}`);
    res.redirect("/admin/users");
  }
}

export function CreateAuthController(
  service: IAuthService,
  adminUsers: IAdminUserService,
  logger: ILoggingService,
): IAuthController {
  return new AuthController(service, adminUsers, logger);
}
