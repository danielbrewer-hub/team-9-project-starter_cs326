import type { Request, Response } from "express";
import { AuthenticationRequired } from "../auth/errors";
import type { IAuthenticatedUser } from "../auth/User";
import {
  recordPageView,
  type IAppBrowserSession,
} from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IEventDetailService } from "./EventDetailService";

export interface IEventDetailController {
  showEventDetail(req: Request, res: Response): Promise<void>;
}

class EventDetailController implements IEventDetailController {
  constructor(
    private readonly service: IEventDetailService,
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

  async showEventDetail(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);
    const eventId = typeof req.params.id === "string" ? req.params.id : "";

    if (!actor) {
      this.logger.warn("Blocked unauthenticated event detail request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.getEventDetail(eventId, {
      userId: actor.id,
      role: actor.role,
    });

    if (result.ok) {
      this.logger.info(`GET /events/${result.value.id} for ${browserSession.browserLabel}`);
      res.render("events/detail", {
        session: browserSession,
        event: result.value,
      });
      return;
    }

    if (result.ok === false) {
      const error = result.value;

      if (error.name === "EventNotFoundError") {
        this.logger.warn(`Event detail not found for id ${eventId}`);
        res.status(404).render("partials/error", {
          message: error.message,
          layout: false,
        });
        return;
      }

      this.logger.error(`Failed to load event detail: ${error.message}`);
      res.status(500).render("partials/error", {
        message: "Unable to load the event right now.",
        layout: false,
      });
    }
  }
}

export function CreateEventDetailController(
  service: IEventDetailService,
  logger: ILoggingService,
): IEventDetailController {
  return new EventDetailController(service, logger);
}
