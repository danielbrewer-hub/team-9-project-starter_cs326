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
  toggleRsvp(req: Request, res: Response): Promise<void>;
}

class EventDetailController implements IEventDetailController {
  constructor(
    private readonly service: IEventDetailService,
    private readonly logger: ILoggingService,
  ) {}
  async toggleRsvp(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);
    const eventId = typeof req.params.id === "string" ? req.params.id : "";

    if (!actor) {
      this.logger.warn("Blocked unauthenticated RSVP toggle request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    // Block staff from toggling RSVP
    if (actor.role === "staff") {
      this.logger.warn(`Blocked RSVP toggle attempt by staff user ${actor.id}`);
      res.status(403).render("partials/error", {
        message: "Staff are not allowed to RSVP for events.",
        layout: false,
      });
      return;
    }

    try {
      const result = await this.service.toggleRsvp(eventId, { userId: actor.id, role: actor.role });
      if (!result.ok) throw result.value;

      this.logger.info(`POST /events/${eventId}/rsvp/toggle by ${actor.id}`);
      // If HTMX, render only the RSVP action area partial
      if (req.get("HX-Request") === "true") {
        res.render("events/detail", {
          session: browserSession,
          event: result.value,
          layout: false,
        }, (err, html) => {
          if (err) {
            this.logger.error(`HTMX RSVP partial render error: ${err}`);
            res.status(500).send("Unable to update RSVP.");
          } else {
            // Extract only the RSVP action area div
            const match = html.match(/<div id=\"rsvp-action-area\"[\s\S]*?<\/div>/);
            res.send(match ? match[0] : "");
          }
        });
      } else {
        res.redirect(`/events/${eventId}`);
      }
    } catch (error: any) {
      if (error?.name === "EventNotFoundError") {
        this.logger.warn(`Event not found for RSVP toggle: ${eventId}`);
        res.status(404).render("partials/error", {
          message: error.message || "Event not found.",
          layout: false,
        });
        return;
      }
      if (error?.name === "EventAuthorizationError") {
        this.logger.warn(`Unauthorized RSVP toggle attempt by ${actor.id}`);
        res.status(403).render("partials/error", {
          message: error.message || "You are not allowed to RSVP for this event.",
          layout: false,
        });
        return;
      }
      if (error?.name === "EventValidationError") {
        this.logger.warn(`Validation error on RSVP toggle: ${error.message}`);
        res.status(400).render("partials/error", {
          message: error.message || "Invalid RSVP action.",
          layout: false,
        });
        return;
      }
      this.logger.error(`Unexpected error in RSVP toggle: ${error?.message || error}`);
      res.status(500).render("partials/error", {
        message: "Unable to update RSVP at this time.",
        layout: false,
      });
    }
  }

  private toActor(session: IAppBrowserSession): IAuthenticatedUser | null {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      return null;
    }

    return {
      userId: authenticatedUser.userId,
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
