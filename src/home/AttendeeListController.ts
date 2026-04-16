import type { Request, Response } from "express";
import { AuthenticationRequired } from "../auth/errors";
import type { IAuthenticatedUser } from "../auth/User";
import { recordPageView, type IAppBrowserSession } from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IAttendeeListService } from "./AttendeeListService";

export interface IAttendeeListController {
  showAttendees(req: Request, res: Response): Promise<void>;
}

class AttendeeListController implements IAttendeeListController {
  constructor(
    private readonly service: IAttendeeListService,
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

  async showAttendees(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);
    if (!actor) {
      this.logger.warn("Blocked unauthenticated request to attendee list");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    const result = await this.service.getAttendeeList(eventId, actor);
    if (result.ok === false) {
      const status =
        result.value.name === "AuthorizationRequired"
          ? 403
          : result.value.name === "ValidationError"
            ? 400
            : 500;

      const logMethod =
        result.value.name === "UnexpectedDependencyError" ? this.logger.error : this.logger.warn;
      logMethod.call(this.logger, `Unable to load attendee list: ${result.value.message}`);

      res.status(status).json({
        error: result.value.message,
      });
      return;
    }

    this.logger.info(`GET /events/${eventId}/attendees for ${actor.email}`);
    res.status(200).json({
      eventId,
      attendees: result.value,
    });
  }
}

export function CreateAttendeeListController(
  service: IAttendeeListService,
  logger: ILoggingService,
): IAttendeeListController {
  return new AttendeeListController(service, logger);
}
