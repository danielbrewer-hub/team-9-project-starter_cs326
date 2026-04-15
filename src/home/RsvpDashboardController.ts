import type { Request, Response } from "express";
import { AuthenticationRequired, AuthorizationRequired } from "../auth/errors";
import type { IAuthenticatedUser } from "../auth/User";
import {
  recordPageView,
  type IAppBrowserSession,
} from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { Result } from "../lib/result";

export interface IRsvpDashboardItem {
  id: string;
  title: string;
  category: string;
  location: string;
  dateLabel: string;
  timeLabel: string;
  rsvpStatus: string;
  eventStatus: string;
}

export interface IRsvpDashboardData {
  upcomingRsvps: IRsvpDashboardItem[];
  pastRsvps: IRsvpDashboardItem[];
}

export type RsvpDashboardError = {
  name: "ValidationError" | "UnexpectedDependencyError" | "AuthorizationRequired";
  message: string;
};

export interface IRsvpDashboardService {
  getRsvpDashboardData(
    actor: IAuthenticatedUser,
  ): Promise<Result<IRsvpDashboardData, RsvpDashboardError>>;
  cancelRsvp(
    rsvpId: string,
    actor: IAuthenticatedUser,
  ): Promise<Result<void, RsvpDashboardError>>;
}

export interface IRsvpDashboardController {
  showRsvpDashboard(req: Request, res: Response): Promise<void>;
  cancelRsvp(req: Request, res: Response): Promise<void>;
}

class RsvpDashboardController implements IRsvpDashboardController {
  constructor(
    private readonly service: IRsvpDashboardService,
    private readonly logger: ILoggingService,
  ) {}

  private toActor(session: IAppBrowserSession): IAuthenticatedUser | null {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      return null;
    }

    return {
      id: authenticatedUser.userId,
      email: authenticatedUser.email,
      displayName: authenticatedUser.displayName,
      role: authenticatedUser.role,
    };
  }

  private isMember(actor: IAuthenticatedUser): boolean {
    return actor.role === "user";
  }

  private renderUnauthorized(req: Request, res: Response, session: IAppBrowserSession): void {
    this.logger.warn("Blocked unauthorized request to RSVP dashboard");
    res.status(403).render("partials/error", {
      message: AuthorizationRequired("Only members may view RSVP dashboards.").message,
      layout: false,
    });
  }

  private renderAuthRequired(req: Request, res: Response): void {
    this.logger.warn("Blocked unauthenticated request to RSVP dashboard");
    res.status(401).render("partials/error", {
      message: AuthenticationRequired("Please log in to continue.").message,
      layout: false,
    });
  }

  async showRsvpDashboard(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      this.renderAuthRequired(req, res);
      return;
    }

    if (!this.isMember(actor)) {
      this.renderUnauthorized(req, res, browserSession);
      return;
    }

    const result = await this.service.getRsvpDashboardData(actor);
    if (result.ok === false) {
      this.logger.error(`Failed to load RSVP dashboard: ${result.value.message}`);
      res.status(500).render("rsvp", {
        session: browserSession,
        pageError: "Unable to load the RSVP dashboard right now.",
        dashboard: null,
      });
      return;
    }

    this.logger.info(`GET /rsvp for ${browserSession.browserLabel}`);
    res.render("rsvp", {
      session: browserSession,
      pageError: null,
      dashboard: result.value,
    });
  }

  async cancelRsvp(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      this.renderAuthRequired(req, res);
      return;
    }

    if (!this.isMember(actor)) {
      this.renderUnauthorized(req, res, browserSession);
      return;
    }

    const rsvpId = typeof req.params.id === "string" ? req.params.id : "";
    const result = await this.service.cancelRsvp(rsvpId, actor);

    if (result.ok === false) {
      const errorMessage = result.value.message;
      const status = result.value.name === "ValidationError" ? 400 : 500;
      const logMethod = result.value.name === "UnexpectedDependencyError" ? this.logger.error : this.logger.warn;
      logMethod.call(this.logger, `Cancel RSVP failed: ${errorMessage}`);

      res.status(status).render("rsvp", {
        session: browserSession,
        pageError: errorMessage,
        dashboard: null,
      });
      return;
    }

    this.logger.info(`Cancelled RSVP ${rsvpId} for ${actor.email}`);
    res.redirect("/rsvp");
  }
}

export function CreateRsvpDashboardController(
  service: IRsvpDashboardService,
  logger: ILoggingService,
): IRsvpDashboardController {
  return new RsvpDashboardController(service, logger);
}
