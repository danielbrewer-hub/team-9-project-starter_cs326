import type { Request, Response } from "express";
import { AuthenticationRequired } from "../auth/errors";
import type { IAuthenticatedUser } from "../auth/User";
import {
  getAuthenticatedUser,
  recordPageView,
  type IAppBrowserSession,
} from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IHomeService } from "./HomeService";

export interface IHomeController {
  showHome(req: Request, res: Response): Promise<void>;
  publishEvent(req: Request, res: Response): Promise<void>;
  cancelEvent(req: Request, res: Response): Promise<void>;
}

class HomeController implements IHomeController {
  constructor(
    private readonly service: IHomeService,
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

  async showHome(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      this.logger.warn("Blocked unauthenticated request to home controller");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.getHomePageData(actor);
    if (result.ok === false) {
      this.logger.error(`Failed to build home page: ${result.value.message}`);
      res.status(500).render("home", {
        session: browserSession,
        pageError: "Unable to load the home page right now.",
        home: null,
      });
      return;
    }

    this.logger.info(`GET /home for ${browserSession.browserLabel}`);
    res.render("home", {
      session: browserSession,
      pageError: null,
      home: result.value,
    });
  }

  async publishEvent(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.publishEvent(actor, req.params.id);

    if (result.ok === false) {
      const status = this.errorStatus(result.value.name);
      res.status(status).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`PUT /events/${req.params.id}/publish by ${actor.email}`);
    res.render("partials/eventDetail", {
      event: result.value,
      session: browserSession,
      layout: false,
    });
  }

  async cancelEvent(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.cancelEvent(actor, req.params.id);

    if (result.ok === false) {
      const status = this.errorStatus(result.value.name);
      res.status(status).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`PUT /events/${req.params.id}/cancel by ${actor.email}`);
    res.render("partials/eventDetail", {
      event: result.value,
      session: browserSession,
      layout: false,
    });
  }

  private errorStatus(name: HomeServiceError["name"]): number {
    const map: Record<HomeServiceError["name"], number> = {
      NotFoundError: 404,
      ForbiddenError: 403,
      InvalidTransitionError: 409,
      ValidationError: 422,
      UnexpectedDependencyError: 500,
    };
    return map[name] ?? 500;
  }
}

export function CreateHomeController(
  service: IHomeService,
  logger: ILoggingService,
): IHomeController {
  return new HomeController(service, logger);
}
