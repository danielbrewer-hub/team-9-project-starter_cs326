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
  editEvent(req: Request, res: Response): Promise<void>;
}

interface EventUpdateFields {
  title: string;
  body: string;
  location: string;
  category: string;
  capacity?: number;
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

  private parseEventUpdate(body: Record<string, unknown>): EventUpdateFields | null {
    const { title, body: description, location, category, capacity } = body;

    if (
      typeof title !== "string" || title.trim() === "" ||
      typeof description !== "string" || description.trim() === "" ||
      typeof location !== "string" || location.trim() === "" ||
      typeof category !== "string" || category.trim() === ""
    ) {
      return null;
    }

    const parsed: EventUpdateFields = {
      title: title.trim(),
      body: description.trim(),
      location: location.trim(),
      category: category.trim(),
    };

    if (capacity !== undefined && capacity !== "") {
      const cap = Number(capacity);
      if (Number.isNaN(cap) || cap < 0 || !Number.isInteger(cap)) {
        return null;
      }
      parsed.capacity = cap;
    }

    return parsed;
  }

  async editEvent(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      this.logger.warn("Blocked unauthenticated edit-event request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const eventId = req.params.id;
    const fields = this.parseEventUpdate(req.body);

    if (!fields) {
      this.logger.warn(`Invalid edit-event payload from ${actor.email}`);
      res.status(422).render("partials/error", {
        message: "All required fields must be filled in with valid values.",
        layout: false,
      });
      return;
    }

    const result = await this.service.updateEvent(actor, eventId, fields);

    if (result.ok === false) {
      this.logger.error(
        `Failed to update event ${eventId}: ${result.value.message}`,
      );
      res.status(500).render("partials/error", {
        message: "Unable to update the event right now.",
        layout: false,
      });
      return;
    }
     this.logger.info(`PUT /events/${eventId} by ${actor.email}`);
    res.render("partials/eventCard", {
      event: result.value,
      session: browserSession,
      layout: false,
    });
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
}

export function CreateHomeController(
  service: IHomeService,
  logger: ILoggingService,
): IHomeController {
  return new HomeController(service, logger);
}
