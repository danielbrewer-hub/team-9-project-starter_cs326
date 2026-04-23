import type { Request, Response } from "express";
import type { IAdminUserService } from "./AdminUserService";
import {
  getAuthenticatedUser,
  recordPageView,
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
  showLogin(req: Request, res: Response): Promise<void>;
  showAdminUsers(req: Request, res: Response): Promise<void>;
  loginFromForm(req: Request, res: Response): Promise<void>;
  logoutFromForm(req: Request, res: Response): Promise<void>;
  createUserFromForm(req: Request, res: Response): Promise<void>;
  deleteUserFromForm(req: Request, res: Response): Promise<void>;
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
    req: Request,
    res: Response,
    pageError: string | null = null,
  ): Promise<void> {
    const session = recordPageView(req.session as AppSessionStore);
    res.render("auth/login", { pageError, session });
  }

  async showAdminUsers(
    req: Request,
    res: Response,
    pageError: string | null = null,
  ): Promise<void> {
    const session = recordPageView(req.session as AppSessionStore);
    await this.renderAdminUsersPage(res, session, pageError);
  }

  async loginFromForm(req: Request, res: Response): Promise<void> {
    const email = typeof req.body.email === "string" ? req.body.email : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const store = req.session as AppSessionStore;
    const session = touchAppSession(store);
    const result = await this.service.authenticate({ email, password });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Login failed: ${error.message}`);
      res.status(status);
      res.render("auth/login", { pageError: error.message, session });
      return;
    }

    const nextSession = signInAuthenticatedUser(store, result.value);
    this.logger.info(`Authenticated ${nextSession.authenticatedUser?.email ?? "unknown user"}`);
    res.redirect("/");
  }

  async logoutFromForm(req: Request, res: Response): Promise<void> {
    const store = req.session as AppSessionStore;
    const currentUser = getAuthenticatedUser(store);

    if (currentUser) {
      this.logger.info(`Signing out ${currentUser.email}`);
    }

    signOutAuthenticatedUser(store);
    res.redirect("/login");
  }

  async createUserFromForm(
    req: Request,
    res: Response,
  ): Promise<void> {
    const session = touchAppSession(req.session as AppSessionStore);
    const roleValue = typeof req.body.role === "string" ? req.body.role : "user";
    const role: UserRole =
      roleValue === "admin" || roleValue === "staff" || roleValue === "user"
        ? roleValue
        : "user";

    const input = {
      email: typeof req.body.email === "string" ? req.body.email : "",
      displayName: typeof req.body.displayName === "string" ? req.body.displayName : "",
      password: typeof req.body.password === "string" ? req.body.password : "",
      role,
    };
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
    req: Request,
    res: Response,
  ): Promise<void> {
    const store = req.session as AppSessionStore;
    const session = touchAppSession(store);
    const currentUser = getAuthenticatedUser(store);
    if (!currentUser) {
      this.logger.warn("Delete user requested without an authenticated session");
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const userId = typeof req.params.id === "string" ? req.params.id : "";
    const result = await this.adminUsers.deleteUser(userId, currentUser.userId);

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
