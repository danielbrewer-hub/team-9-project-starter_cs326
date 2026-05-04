import type { Request, Response } from "express";
import type { IAuthenticatedUser, UserRole } from "../../src/auth/User";
import { CreateEventDetailController } from "../../src/events/EventDetailController";
import type { IEventDetailService } from "../../src/events/EventDetailService";
import type { IEventDetailView } from "../../src/events/EventTypes";
import {
  EventAuthorizationError,
  EventNotFoundError,
  EventValidationError,
  UnexpectedDependencyError,
  type EventRsvpToggleError,
} from "../../src/events/errors";
import { Err, Ok } from "../../src/lib/result";
import {
  signInAuthenticatedUser,
  type AppSessionStore,
} from "../../src/session/AppSession";
import type { ILoggingService } from "../../src/service/LoggingService";

const usersByRole: Record<UserRole, IAuthenticatedUser> = {
  admin: {
    id: "user-admin",
    email: "admin@app.test",
    displayName: "Avery Admin",
    role: "admin",
  },
  staff: {
    id: "user-staff",
    email: "staff@app.test",
    displayName: "Sam Staff",
    role: "staff",
  },
  user: {
    id: "user-reader",
    email: "user@app.test",
    displayName: "Una User",
    role: "user",
  },
};

function createServiceMock(): jest.Mocked<IEventDetailService> {
  return {
    getEventDetail: jest.fn(),
    toggleRsvp: jest.fn(),
    getAttendeeList: jest.fn(),
  };
}

function createLoggerMock(): jest.Mocked<ILoggingService> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createResponseMock(): jest.Mocked<Pick<Response, "status" | "render" | "redirect" | "set" | "send">> {
  const response = {
    status: jest.fn(),
    render: jest.fn(),
    redirect: jest.fn(),
    set: jest.fn(),
    send: jest.fn(),
  };

  response.status.mockReturnValue(response as unknown as Response);
  response.render.mockReturnValue(response as unknown as Response);
  response.redirect.mockReturnValue(response as unknown as Response);
  response.set.mockReturnValue(response as unknown as Response);
  response.send.mockReturnValue(response as unknown as Response);

  return response;
}

function createRequest(
  user?: IAuthenticatedUser,
  params: Record<string, unknown> = { id: "event-rsvp-toggle" },
  headers: Record<string, string | undefined> = {},
): Request {
  const session = {} as AppSessionStore;
  if (user) {
    signInAuthenticatedUser(session, user);
  }

  return {
    session,
    params,
    get: jest.fn((name: string) => headers[name] ?? headers[name.toLowerCase()]),
  } as unknown as Request;
}

function createEvent(overrides: Partial<IEventDetailView> = {}): IEventDetailView {
  return {
    id: "event-rsvp-toggle",
    title: "Architecture Review",
    description: "Discuss the event details RSVP toggle workflow.",
    location: "CS Building Room 204",
    category: "planning",
    status: "published",
    capacity: 10,
    startDatetime: "2026-05-01T14:00:00.000Z",
    endDatetime: "2026-05-01T15:30:00.000Z",
    organizerId: "user-staff",
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
    organizerDisplayName: "Sam Staff",
    attendeeCount: 4,
    canEdit: false,
    canCancel: false,
    canRsvp: true,
    rsvpStatus: null,
    isRsvpPending: false,
    isFull: false,
    ...overrides,
  };
}

function createHarness() {
  const service = createServiceMock();
  const logger = createLoggerMock();
  const controller = CreateEventDetailController(service, logger);
  const res = createResponseMock();

  return { controller, service, logger, res };
}

describe("EventDetailController RSVP toggle", () => {
  describe("toggleRsvp", () => {
    it("renders a 401 partial when no authenticated user is in the session", async () => {
      const { controller, service, logger, res } = createHarness();
      const req = createRequest(undefined, { id: "event-rsvp-toggle" });

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.render).toHaveBeenCalledWith("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      expect(logger.warn).toHaveBeenCalledWith("Blocked unauthenticated RSVP toggle request");
      expect(service.toggleRsvp).not.toHaveBeenCalled();
    });

    it.each<UserRole>(["admin", "staff"])(
      "renders a 403 partial for authenticated %s users",
      async (role) => {
        const { controller, service, logger, res } = createHarness();
        const req = createRequest(usersByRole[role], { id: "event-rsvp-toggle" });

        await controller.toggleRsvp(req, res as unknown as Response);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.render).toHaveBeenCalledWith("partials/error", {
          message: "Only members may RSVP for events.",
          layout: false,
        });
        expect(logger.warn).toHaveBeenCalledWith(
          `Blocked RSVP toggle attempt by ${role} user ${usersByRole[role].id}`,
        );
        expect(service.toggleRsvp).not.toHaveBeenCalled();
      },
    );

    it("redirects to the event detail page when a member submits a non-HTMX toggle", async () => {
      const { controller, service, logger, res } = createHarness();
      const event = createEvent({ rsvpStatus: "going", attendeeCount: 5 });
      service.toggleRsvp.mockResolvedValue(Ok(event));
      const req = createRequest(usersByRole.user, { id: event.id });

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(service.toggleRsvp).toHaveBeenCalledWith(event.id, {
        userId: usersByRole.user.id,
        role: "user",
      });
      expect(res.redirect).toHaveBeenCalledWith(`/events/${event.id}`);
      expect(res.render).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `POST /events/${event.id}/rsvp/toggle by ${usersByRole.user.id}`,
      );
    });

    it("renders the RSVP toggle partial when a member submits an HTMX toggle", async () => {
      const { controller, service, logger, res } = createHarness();
      const event = createEvent({ rsvpStatus: "waitlisted", attendeeCount: 10, isFull: true });
      service.toggleRsvp.mockResolvedValue(Ok(event));
      const req = createRequest(
        usersByRole.user,
        { id: event.id },
        { "HX-Request": "true" },
      );

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(service.toggleRsvp).toHaveBeenCalledWith(event.id, {
        userId: usersByRole.user.id,
        role: "user",
      });
      expect(res.render).toHaveBeenCalledWith("events/partials/rsvp-toggle-response", {
        session: expect.objectContaining({
          authenticatedUser: expect.objectContaining({
            userId: usersByRole.user.id,
            email: usersByRole.user.email,
            role: "user",
          }),
          visitCount: 1,
        }),
        event,
        layout: false,
      });
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `POST /events/${event.id}/rsvp/toggle by ${usersByRole.user.id}`,
      );
    });

    it("triggers a dashboard refresh when a dashboard HTMX toggle succeeds", async () => {
      const { controller, service, logger, res } = createHarness();
      const event = createEvent({ rsvpStatus: "cancelled", attendeeCount: 4 });
      service.toggleRsvp.mockResolvedValue(Ok(event));
      const req = createRequest(
        usersByRole.user,
        { id: event.id },
        { "HX-Request": "true", "HX-RSVP-Dashboard": "true" },
      );

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(service.toggleRsvp).toHaveBeenCalledWith(event.id, {
        userId: usersByRole.user.id,
        role: "user",
      });
      expect(res.set).toHaveBeenCalledWith("HX-Trigger", "rsvp-dashboard-refresh");
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalledWith();
      expect(res.render).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `POST /events/${event.id}/rsvp/toggle by ${usersByRole.user.id}`,
      );
    });

    it("passes an empty event id to the service when the route parameter is not a string", async () => {
      const { controller, service, res } = createHarness();
      service.toggleRsvp.mockResolvedValue(Err(EventNotFoundError("Event not found.")));
      const req = createRequest(usersByRole.user, {});

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(service.toggleRsvp).toHaveBeenCalledWith("", {
        userId: usersByRole.user.id,
        role: "user",
      });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("passes unusual event ids through to the service", async () => {
      const { controller, service, res } = createHarness();
      service.toggleRsvp.mockResolvedValue(Err(EventNotFoundError("Event not found.")));
      const req = createRequest(usersByRole.user, { id: "   " });

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(service.toggleRsvp).toHaveBeenCalledWith("   ", {
        userId: usersByRole.user.id,
        role: "user",
      });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it.each([
      [
        EventNotFoundError("Event not found or not open for RSVP."),
        404,
        "Event not found or not open for RSVP.",
        "warn",
        "Event not found for RSVP toggle: event-rsvp-toggle",
      ],
      [
        EventAuthorizationError("You are not allowed to RSVP for this event."),
        403,
        "You are not allowed to RSVP for this event.",
        "warn",
        `Unauthorized RSVP toggle attempt by ${usersByRole.user.id}`,
      ],
      [
        EventValidationError("Invalid RSVP action."),
        400,
        "Invalid RSVP action.",
        "warn",
        "Validation error on RSVP toggle: Invalid RSVP action.",
      ],
      [
        UnexpectedDependencyError("Unable to save RSVP."),
        500,
        "Unable to update RSVP at this time.",
        "error",
        "Unexpected error in RSVP toggle: Unable to save RSVP.",
      ],
    ] as const)(
      "maps %s to a %i partial response",
      async (error, status, message, logLevel, logMessage) => {
        const { controller, service, logger, res } = createHarness();
        service.toggleRsvp.mockResolvedValue(Err(error));
        const req = createRequest(
          usersByRole.user,
          { id: "event-rsvp-toggle" },
          { "HX-Request": "true" },
        );

        await controller.toggleRsvp(req, res as unknown as Response);

        expect(service.toggleRsvp).toHaveBeenCalledWith("event-rsvp-toggle", {
          userId: usersByRole.user.id,
          role: "user",
        });
        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.render).toHaveBeenCalledWith("partials/error", {
          message,
          layout: false,
        });
        expect(logger[logLevel]).toHaveBeenCalledWith(logMessage);
        expect(res.redirect).not.toHaveBeenCalled();
      },
    );

    it.each([
      [EventNotFoundError(""), 404, "Event not found."],
      [
        EventAuthorizationError(""),
        403,
        "You are not allowed to RSVP for this event.",
      ],
      [EventValidationError(""), 400, "Invalid RSVP action."],
    ])(
      "uses the fallback message when a handled %s has no message",
      async (error: EventRsvpToggleError, status: number, message: string) => {
        const { controller, service, res } = createHarness();
        service.toggleRsvp.mockResolvedValue(Err(error));
        const req = createRequest(usersByRole.user, { id: "event-rsvp-toggle" });

        await controller.toggleRsvp(req, res as unknown as Response);

        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.render).toHaveBeenCalledWith("partials/error", {
          message,
          layout: false,
        });
      },
    );

    it("renders a generic 500 and logs the thrown error when the service rejects", async () => {
      const { controller, service, logger, res } = createHarness();
      service.toggleRsvp.mockRejectedValue(new Error("repository exploded"));
      const req = createRequest(usersByRole.user, { id: "event-rsvp-toggle" });

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.render).toHaveBeenCalledWith("partials/error", {
        message: "Unable to update RSVP at this time.",
        layout: false,
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Unexpected error in RSVP toggle: repository exploded",
      );
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it("renders a generic 500 and logs non-Error thrown values", async () => {
      const { controller, service, logger, res } = createHarness();
      service.toggleRsvp.mockRejectedValue("plain failure");
      const req = createRequest(usersByRole.user, { id: "event-rsvp-toggle" });

      await controller.toggleRsvp(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.render).toHaveBeenCalledWith("partials/error", {
        message: "Unable to update RSVP at this time.",
        layout: false,
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Unexpected error in RSVP toggle: plain failure",
      );
    });
  });
});
