import type { Request, Response } from "express";
import { AuthenticationRequired, AuthorizationRequired } from "../auth/errors";
import type { IAuthenticatedUser } from "../auth/User";
import {
  getAuthenticatedUser,
  recordPageView,
  touchAppSession,
  type IAppBrowserSession,
} from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IEventCreationService } from "./EventCreationService";
import type { ICreateEventInput } from "./EventTypes";

type EventCreationFieldErrors = Partial<Record<keyof ICreateEventInput, string>>;

type EventCreationFormValues = Record<keyof ICreateEventInput, string>;

export interface IEventCreationController {
  showCreateEventForm(req: Request, res: Response): Promise<void>;
  createEventFromForm(req: Request, res: Response): Promise<void>;
}

function defaultFormValues(): EventCreationFormValues {
  return {
    title: "",
    description: "",
    location: "",
    category: "",
    capacity: "",
    startDatetime: "",
    endDatetime: "",
  };
}

function buildFormValues(body: Request["body"]): EventCreationFormValues {
  return {
    title: typeof body?.title === "string" ? body.title : "",
    description: typeof body?.description === "string" ? body.description : "",
    location: typeof body?.location === "string" ? body.location : "",
    category: typeof body?.category === "string" ? body.category : "",
    capacity: typeof body?.capacity === "string" ? body.capacity : "",
    startDatetime: typeof body?.startDatetime === "string" ? body.startDatetime : "",
    endDatetime: typeof body?.endDatetime === "string" ? body.endDatetime : "",
  };
}

class EventCreationController implements IEventCreationController {
  constructor(
    private readonly service: IEventCreationService,
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

  private renderCreateForm(
    res: Response,
    session: IAppBrowserSession,
    options?: {
      fieldErrors?: EventCreationFieldErrors;
      formError?: string | null;
      formValues?: EventCreationFormValues;
      statusCode?: number;
    },
  ): void {
    res.status(options?.statusCode ?? 200).render("events/new", {
      session,
      fieldErrors: options?.fieldErrors ?? {},
      formError: options?.formError ?? null,
      formValues: options?.formValues ?? defaultFormValues(),
    });
  }

  async showCreateEventForm(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);

    if (!actor) {
      this.logger.warn("Blocked unauthenticated request to event creation form");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    if (!["staff", "admin"].includes(actor.role)) {
      this.logger.warn(`Blocked event creation form access for role ${actor.role}`);
      res.status(403).render("partials/error", {
        message: AuthorizationRequired("Only organizers and admins can create events.").message,
        layout: false,
      });
      return;
    }

    this.logger.info(`GET /events/new for ${browserSession.browserLabel}`);
    this.renderCreateForm(res, browserSession);
  }

  async createEventFromForm(req: Request, res: Response): Promise<void> {
    const browserSession = touchAppSession(req.session);
    const actor = this.toActor(browserSession);
    const formValues = buildFormValues(req.body);

    if (!actor) {
      this.logger.warn("Blocked unauthenticated event creation attempt");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.createEvent(formValues, {
      userId: actor.id,
      role: actor.role,
    });

    if (result.ok) {
      this.logger.info(`POST /events created ${result.value.id} by ${actor.id}`);
      res.redirect(`/events/${result.value.id}`);
      return;
    }

    if (result.value.name === "EventValidationError") {
      const fieldErrors: EventCreationFieldErrors = result.value.field
        ? { [result.value.field as keyof ICreateEventInput]: result.value.message }
        : {};
      this.logger.warn(`Rejected event creation form: ${result.value.message}`);
      this.renderCreateForm(res, browserSession, {
        fieldErrors,
        formError: fieldErrors[result.value.field as keyof ICreateEventInput]
          ? null
          : result.value.message,
        formValues,
        statusCode: 400,
      });
      return;
    }

    if (result.value.name === "EventAuthorizationError") {
      this.logger.warn(`Blocked unauthorized event creation for ${actor.id}`);
      res.status(403).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    this.logger.error(`Failed to create event: ${result.value.message}`);
    this.renderCreateForm(res, browserSession, {
      formError: "Unable to create the event right now.",
      formValues,
      statusCode: 500,
    });
  }
}

export function CreateEventCreationController(
  service: IEventCreationService,
  logger: ILoggingService,
): IEventCreationController {
  return new EventCreationController(service, logger);
}
