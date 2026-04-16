import type { Request, Response } from "express";
import { AuthenticationRequired } from "../auth/errors";
import type { IActingUser } from "./EventTypes";
import {
  recordPageView,
  type IAppBrowserSession,
} from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IEventLifecycleService } from "./EventLifecycleService";
import type { EventLifecycleError } from "./EventLifecycleErrors";

export interface IEventLifecycleController {
  publishEvent(req: Request<{ id: string }>, res: Response): Promise<void>;
  cancelEvent(req: Request<{ id: string }>, res: Response): Promise<void>;
}

class EventLifecycleController implements IEventLifecycleController {
  constructor(
    private readonly service: IEventLifecycleService,
    private readonly logger: ILoggingService,
  ) {}

  private toActor(session: IAppBrowserSession): IActingUser | null {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      return null;
    }
    return {
      userId: authenticatedUser.userId,
      role: authenticatedUser.role,
    };
  }

  private errorStatus(name: EventLifecycleError["name"]): number {
    const map: Record<EventLifecycleError["name"], number> = {
      EventNotFoundError: 404,
      EventForbiddenError: 403,
      EventInvalidTransitionError: 409,
      UnexpectedDependencyError: 500,
    };
    return map[name] ?? 500;
  }

  async publishEvent(req: Request<{ id: string }>, res: Response): Promise<void> { 
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      this.logger.warn("Blocked unauthenticated publish-event request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.publishEvent(req.params.id, actor);

    if (result.ok === false) {
      this.logger.warn(
        `Publish event ${req.params.id} failed: ${result.value.message}`,
      );
      res.status(this.errorStatus(result.value.name)).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`PUT /events/${req.params.id}/publish by ${actor.userId}`);
    res.render("partials/eventDetail", {
      event: result.value,
      layout: false,
    });
  }

 async cancelEvent(req: Request<{ id: string }>, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      this.logger.warn("Blocked unauthenticated cancel-event request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.cancelEvent(req.params.id, actor);

    if (result.ok === false) {
      this.logger.warn(
        `Cancel event ${req.params.id} failed: ${result.value.message}`,
      );
      res.status(this.errorStatus(result.value.name)).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`PUT /events/${req.params.id}/cancel by ${actor.userId}`);
    res.render("partials/eventDetail", {
      event: result.value,
      layout: false,
    });
  }
}

export function CreateEventLifecycleController(
  service: IEventLifecycleService,
  logger: ILoggingService,
): IEventLifecycleController {
  return new EventLifecycleController(service, logger);
}