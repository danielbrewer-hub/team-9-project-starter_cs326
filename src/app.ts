import path from "node:path";
import express, { Request, RequestHandler, Response } from "express";
import session from "express-session";
import Layouts from "express-ejs-layouts";
import { IAuthController } from "./auth/AuthController";
import type { IEventCreationController } from "./events/EventCreationController";
import type { IEventDetailController } from "./events/EventDetailController";
import type { IHomeController } from "./home/HomeController";
import type { IRsvpDashboardController } from "./home/RsvpDashboardController";
import type { IEventController } from "./events/EventController";
import {
  AuthenticationRequired,
  AuthorizationRequired,
} from "./auth/errors";
import type { UserRole } from "./auth/User";
import { IApp } from "./contracts";
import {
  getAuthenticatedUser,
  isAuthenticatedSession,
  AppSessionStore,
  touchAppSession,
} from "./session/AppSession";
import { ILoggingService } from "./service/LoggingService";

type AsyncRequestHandler = RequestHandler;

function asyncHandler(fn: AsyncRequestHandler) {
  return function wrapped(req: Request, res: Response, next: (value?: unknown) => void) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sessionStore(req: Request): AppSessionStore {
  return req.session as AppSessionStore;
}

class ExpressApp implements IApp {
  private readonly app: express.Express;

  constructor(
    private readonly authController: IAuthController,
    private readonly eventCreationController: IEventCreationController,
    private readonly eventDetailController: IEventDetailController,
    private readonly homeController: IHomeController,
    private readonly rsvpDashboardController: IRsvpDashboardController,
    private readonly eventController: IEventController,
    private readonly logger: ILoggingService,
  ) {
    this.app = express();
    this.registerMiddleware();
    this.registerTemplating();
    this.registerRoutes();
  }

  private registerMiddleware(): void {
    // Serve static files from src/static (create this directory to add your own assets)
    this.app.use(express.static(path.join(process.cwd(), "src/static")));
    this.app.use(
      session({
        name: "app.sid",
        secret: process.env.SESSION_SECRET ?? "project-starter-demo-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
        },
      }),
    );
    this.app.use(Layouts);
    this.app.use(express.urlencoded({ extended: true }));
  }

  private registerTemplating(): void {
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(process.cwd(), "src/views"));
    this.app.set("layout", "layouts/base");
  }

  private isHtmxRequest(req: Request): boolean {
    return req.get("HX-Request") === "true";
  }

  /**
   * Middleware helper: returns true if the request is from an authenticated user.
   * If the user is not authenticated, it handles the response (redirect or 401).
   */
  private requireAuthenticated(req: Request, res: Response): boolean {
    const store = sessionStore(req);
    touchAppSession(store);

    if (getAuthenticatedUser(store)) {
      return true;
    }

    this.logger.warn("Blocked unauthenticated request to a protected route");
    if (this.isHtmxRequest(req) || req.method !== "GET") {
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return false;
    }

    res.redirect("/login");
    return false;
  }

  /**
   * Middleware helper: returns true if the authenticated user has one of the
   * allowed roles. Calls requireAuthenticated first, so unauthenticated
   * requests are handled automatically.
   */
  private requireRole(
    req: Request,
    res: Response,
    allowedRoles: UserRole[],
    message: string,
  ): boolean {
    if (!this.requireAuthenticated(req, res)) {
      return false;
    }

    const currentUser = getAuthenticatedUser(sessionStore(req));
    if (currentUser && allowedRoles.includes(currentUser.role)) {
      return true;
    }

    this.logger.warn(
      `Blocked unauthorized request for role ${currentUser?.role ?? "unknown"}`,
    );
    res.status(403).render("partials/error", {
      message: AuthorizationRequired(message).message,
      layout: false,
    });
    return false;
  }

  private registerRoutes(): void {
    // ── Public routes ────────────────────────────────────────────────

    this.app.get(
      "/",
      asyncHandler(async (req, res) => {
        this.logger.info("GET /");
        const store = sessionStore(req);
        res.redirect(isAuthenticatedSession(store) ? "/home" : "/login");
      }),
    );

    this.app.get(
      "/login",
      asyncHandler(async (req, res) => {
        const store = sessionStore(req);

        if (getAuthenticatedUser(store)) {
          res.redirect("/home");
          return;
        }

        await this.authController.showLogin(req, res);
      }),
    );

    this.app.post(
      "/login",
      asyncHandler(async (req, res) => {
        await this.authController.loginFromForm(req, res);
      }),
    );

    this.app.post(
      "/logout",
      asyncHandler(async (req, res) => {
        await this.authController.logoutFromForm(req, res);
      }),
    );

    // ── Admin routes ─────────────────────────────────────────────────

    this.app.get(
      "/admin/users",
      asyncHandler(async (req, res) => {
        if (!this.requireRole(req, res, ["admin"], "Only Admin can manage users.")) {
          return;
        }

        await this.authController.showAdminUsers(req, res);
      }),
    );

    this.app.post(
      "/admin/users",
      asyncHandler(async (req, res) => {
        if (!this.requireRole(req, res, ["admin"], "Only Admin can manage users.")) {
          return;
        }

        await this.authController.createUserFromForm(req, res);
      }),
    );

    this.app.post(
      "/admin/users/:id/delete",
      asyncHandler(async (req, res) => {
        if (!this.requireRole(req, res, ["admin"], "Only Admin can manage users.")) {
          return;
        }

        await this.authController.deleteUserFromForm(req, res);
      }),
    );

    // ── Authenticated home page ──────────────────────────────────────

    this.app.get(
      "/home",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.homeController.showHome(req, res);
      }),
    );

    this.app.get(
      "/events/new",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.eventCreationController.showCreateEventForm(req, res);
      }),
    );

    // ── Event list + search (Feature 6 & 10) ─────────────────────────
    // Must be registered before /events/:id so Express does not treat
    // the literal string "search" as an event ID parameter.

    this.app.get(
      "/events",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        await this.eventController.list(req, res);
      }),
    );

    this.app.get(
      "/events/search",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        await this.eventController.search(req, res);
      }),
    );

    this.app.post(
      "/events",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.eventCreationController.createEventFromForm(req, res);
      }),
    );

    this.app.get(
      "/events/:id",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.eventDetailController.showEventDetail(req, res);
      }),
    );

    this.app.post(
      "/events/:id/rsvp/toggle",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.eventDetailController.toggleRsvp(req, res);
      }),
    );

    this.app.get(
      "/rsvp",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.rsvpDashboardController.showRsvpDashboard(req, res);
      }),
    );

    this.app.get(
      "/rsvp/partials/sections",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.rsvpDashboardController.renderRsvpDashboardSections(req, res);
      }),
    );

    this.app.post(
      "/rsvp/:id/cancel",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        await this.rsvpDashboardController.cancelRsvp(req, res);
      }),
    );

    // ── Error handler ────────────────────────────────────────────────

    this.app.use((err: unknown, _req: Request, res: Response, _next: (value?: unknown) => void) => {
      const message = err instanceof Error ? err.message : "Unexpected server error.";
      this.logger.error(message);
      res.status(500).render("partials/error", {
        message: "Unexpected server error.",
        layout: false,
      });
    });
  }

  getExpressApp(): express.Express {
    return this.app;
  }
}

export function CreateApp(
  authController: IAuthController,
  eventCreationController: IEventCreationController,
  eventDetailController: IEventDetailController,
  homeController: IHomeController,
  rsvpDashboardController: IRsvpDashboardController,
  eventController: IEventController,
  logger: ILoggingService,
): IApp {
  return new ExpressApp(
    authController,
    eventCreationController,
    eventDetailController,
    homeController,
    rsvpDashboardController,
    eventController,
    logger,
  );
}
