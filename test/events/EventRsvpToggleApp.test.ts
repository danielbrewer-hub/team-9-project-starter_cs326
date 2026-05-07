import type { Request, Response } from "express";
import request from "supertest";
import { CreateApp } from "../../src/app";
import type { IAuthController } from "../../src/auth/AuthController";
import type { UserRole } from "../../src/auth/User";
import type { IEventCreationController } from "../../src/events/EventCreationController";
import type { IEventController } from "../../src/events/EventController";
import { CreateEventDetailController } from "../../src/events/EventDetailController";
import type { IEventDetailService } from "../../src/events/EventDetailService";
import type { IEventDetailView } from "../../src/events/EventTypes";
import {
  EventAuthorizationError,
  EventNotFoundError,
  EventValidationError,
  UnexpectedDependencyError,
} from "../../src/events/errors";
import type { IHomeController } from "../../src/home/HomeController";
import type { IRsvpDashboardController } from "../../src/home/RsvpDashboardController";
import { Err, Ok } from "../../src/lib/result";
import {
  signInAuthenticatedUser,
  type AppSessionStore,
} from "../../src/session/AppSession";
import type { ILoggingService } from "../../src/service/LoggingService";

const usersByRole: Record<UserRole, { id: string; email: string; displayName: string; role: UserRole }> = {
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

class TestAuthController implements IAuthController {
  async showLogin(_req: Request, res: Response): Promise<void> {
    res.status(200).send("login");
  }

  async showAdminUsers(_req: Request, res: Response): Promise<void> {
    res.status(200).send("admin users");
  }

  async loginFromForm(req: Request, res: Response): Promise<void> {
    const role = req.body.role as UserRole | undefined;
    const user = role ? usersByRole[role] : null;
    if (!user) {
      res.status(400).send("unknown role");
      return;
    }

    signInAuthenticatedUser(req.session as AppSessionStore, user);
    res.redirect("/home");
  }

  async logoutFromForm(req: Request, res: Response): Promise<void> {
    req.session.destroy(() => res.redirect("/login"));
  }

  async createUserFromForm(_req: Request, res: Response): Promise<void> {
    res.status(201).send("created");
  }

  async deleteUserFromForm(_req: Request, res: Response): Promise<void> {
    res.status(204).send();
  }
}

const eventCreationController: IEventCreationController = {
  showCreateEventForm: jest.fn(async (_req, res) => {
    res.status(200).send("new event");
  }),
  createEventFromForm: jest.fn(async (_req, res) => {
    res.status(201).send("event created");
  }),
  finalizeEdits: jest.fn(async (_req, res) => {
    res.status(200).send("event edited");
  }),
};

const homeController: IHomeController = {
  showHome: jest.fn(async (_req, res) => {
    res.status(200).send("home");
  }),
};

const rsvpDashboardController: IRsvpDashboardController = {
  showRsvpDashboard: jest.fn(async (_req, res) => {
    res.status(200).send("rsvp dashboard");
  }),
  renderRsvpDashboardSections: jest.fn(async (_req, res) => {
    res.status(200).send("rsvp dashboard sections");
  }),
  cancelRsvp: jest.fn(async (_req, res) => {
    res.status(200).send("rsvp cancelled");
  }),
};

const eventController: IEventController = {
  list: jest.fn(async (_req, res) => {
    res.status(200).send("event list");
  }),
  search: jest.fn(async (_req, res) => {
    res.status(200).send("event search");
  }),
};

function createLoggerMock(): jest.Mocked<ILoggingService> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createEventDetailServiceMock(): jest.Mocked<IEventDetailService> {
  return {
    getEventDetail: jest.fn(),
    toggleRsvp: jest.fn(),
    getAttendeeList: jest.fn(),
  };
}

function createEvent(overrides: Partial<IEventDetailView> = {}): IEventDetailView {
  return {
    id: "event-rsvp-toggle",
    title: "Architecture Review",
    description: "Discuss the current event-details RSVP workflow.",
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
  const logger = createLoggerMock();
  const service = createEventDetailServiceMock();
  const eventDetailController = CreateEventDetailController(service, logger);
  const app = CreateApp(
    new TestAuthController(),
    eventCreationController,
    eventDetailController,
    homeController,
    rsvpDashboardController,
    eventController,
    logger,
  ).getExpressApp();

  return { app, service, logger };
}

async function signIn(
  app: ReturnType<typeof createHarness>["app"],
  role: UserRole,
): Promise<request.Agent> {
  const agent = request.agent(app);
  await agent.post("/login").type("form").send({ role }).expect(302);
  return agent;
}

describe("event RSVP toggle app layer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("event detail RSVP button rendering", () => {
    it("redirects unauthenticated event detail requests to login", async () => {
      const { app, service } = createHarness();

      const response = await request(app).get("/events/event-rsvp-toggle").expect(302);

      expect(response.headers.location).toBe("/login");
      expect(service.getEventDetail).not.toHaveBeenCalled();
    });

    it.each([
      ["open event with no RSVP", createEvent(), "RSVP Going", "You are not RSVPed."],
      [
        "full event with no RSVP",
        createEvent({ attendeeCount: 10, isFull: true }),
        "Join Waitlist",
        "Event is full. You can join the waitlist.",
      ],
      [
        "member already going",
        createEvent({ rsvpStatus: "going" }),
        "Cancel RSVP",
        "You are attending this event.",
      ],
      [
        "member waitlisted",
        createEvent({ rsvpStatus: "waitlisted", isFull: true }),
        "Leave Waitlist",
        "You are on the waitlist.",
      ],
    ])("renders the RSVP toggle button for a %s", async (_label, event, buttonText, helperText) => {
      const { app, service } = createHarness();
      service.getEventDetail.mockResolvedValue(Ok(event));
      const agent = await signIn(app, "user");

      const response = await agent.get(`/events/${event.id}`).expect(200);

      expect(response.text).toContain('id="rsvp-toggle-form"');
      expect(response.text).toContain(`action="/events/${event.id}/rsvp/toggle"`);
      expect(response.text).toContain(`hx-post="/events/${event.id}/rsvp/toggle"`);
      expect(response.text).toContain(buttonText);
      expect(response.text).toContain(helperText);
      expect(response.text).toContain(`${event.attendeeCount} / ${event.capacity} attending`);
      expect(service.getEventDetail).toHaveBeenCalledWith(event.id, {
        userId: usersByRole.user.id,
        role: "user",
      });
    });

    it("does not render the toggle form when the event detail view says RSVP is unavailable", async () => {
      const { app, service } = createHarness();
      const event = createEvent({
        canRsvp: false,
        capacity: undefined,
        attendeeCount: 0,
      });
      service.getEventDetail.mockResolvedValue(Ok(event));
      const agent = await signIn(app, "user");

      const response = await agent.get(`/events/${event.id}`).expect(200);

      expect(response.text).not.toContain('id="rsvp-toggle-form"');
      expect(response.text).toContain("No direct actions are available for your role on this event yet.");
      expect(response.text).toContain("0 attending");
    });
  });

  describe("POST /events/:id/rsvp/toggle", () => {
    it("returns a 401 partial error for unauthenticated requests before reaching the controller service", async () => {
      const { app, service } = createHarness();

      const response = await request(app)
        .post("/events/event-rsvp-toggle/rsvp/toggle")
        .expect(401);

      expect(response.text).toContain("Please log in to continue.");
      expect(service.toggleRsvp).not.toHaveBeenCalled();
    });

    it.each<UserRole>(["admin", "staff"])(
      "blocks authenticated %s users from toggling RSVP state",
      async (role) => {
        const { app, service } = createHarness();
        const agent = await signIn(app, role);

        const response = await agent
          .post("/events/event-rsvp-toggle/rsvp/toggle")
          .expect(403);

        expect(response.text).toContain("Only members may RSVP for events.");
        expect(service.toggleRsvp).not.toHaveBeenCalled();
      },
    );

    it("redirects back to the event detail page after a successful non-HTMX toggle", async () => {
      const { app, service } = createHarness();
      const event = createEvent({ rsvpStatus: "going", attendeeCount: 5 });
      service.toggleRsvp.mockResolvedValue(Ok(event));
      const agent = await signIn(app, "user");

      const response = await agent
        .post(`/events/${event.id}/rsvp/toggle`)
        .expect(302);

      expect(response.headers.location).toBe(`/events/${event.id}`);
      expect(service.toggleRsvp).toHaveBeenCalledWith(event.id, {
        userId: usersByRole.user.id,
        role: "user",
      });
    });

    it.each([
      [
        "member joins as going",
        createEvent({ rsvpStatus: "going", attendeeCount: 5 }),
        "Cancel RSVP",
        "You are attending this event.",
        "5 / 10 attending",
      ],
      [
        "member joins the waitlist",
        createEvent({ rsvpStatus: "waitlisted", attendeeCount: 10, isFull: true }),
        "Leave Waitlist",
        "You are on the waitlist.",
        "10 / 10 attending",
      ],
      [
        "member cancels an existing RSVP",
        createEvent({ rsvpStatus: "cancelled", attendeeCount: 4 }),
        "RSVP Going",
        "You are not RSVPed.",
        "4 / 10 attending",
      ],
      [
        "event has unlimited capacity",
        createEvent({ capacity: undefined, attendeeCount: 12, rsvpStatus: "going" }),
        "Cancel RSVP",
        "You are attending this event.",
        "12 attending",
      ],
    ])("renders the updated HTMX action area when a %s", async (_label, event, buttonText, helperText, attendanceText) => {
      const { app, service } = createHarness();
      service.toggleRsvp.mockResolvedValue(Ok(event));
      const agent = await signIn(app, "user");

      const response = await agent
        .post(`/events/${event.id}/rsvp/toggle`)
        .set("HX-Request", "true")
        .expect(200);

      expect(response.text).toContain('id="rsvp-action-area"');
      expect(response.text).toContain('id="rsvp-toggle-form"');
      expect(response.text).toContain(`action="/events/${event.id}/rsvp/toggle"`);
      expect(response.text).toContain(buttonText);
      expect(response.text).toContain(helperText);
      expect(response.text).toContain('hx-swap-oob="outerHTML:#event-attendance-summary"');
      expect(response.text).toContain(attendanceText);
      expect(service.toggleRsvp).toHaveBeenCalledWith(event.id, {
        userId: usersByRole.user.id,
        role: "user",
      });
    });

    it("triggers a dashboard section refresh when the dashboard submits an HTMX cancel through the toggle route", async () => {
      const { app, service } = createHarness();
      const event = createEvent({ rsvpStatus: "cancelled", attendeeCount: 4 });
      service.toggleRsvp.mockResolvedValue(Ok(event));
      const agent = await signIn(app, "user");

      const response = await agent
        .post(`/events/${event.id}/rsvp/toggle`)
        .set("HX-Request", "true")
        .set("HX-RSVP-Dashboard", "true")
        .expect(204);

      expect(response.headers["hx-trigger"]).toBe("rsvp-dashboard-refresh");
      expect(response.text).toBe("");
      expect(service.toggleRsvp).toHaveBeenCalledWith(event.id, {
        userId: usersByRole.user.id,
        role: "user",
      });
    });

    it.each([
      [EventNotFoundError("Event not found."), 404, "Event not found."],
      [
        EventAuthorizationError("You are not allowed to RSVP for this event."),
        403,
        "You are not allowed to RSVP for this event.",
      ],
      [EventValidationError("Invalid RSVP action."), 400, "Invalid RSVP action."],
      [
        UnexpectedDependencyError("Repository unavailable."),
        500,
        "Unable to update RSVP at this time.",
      ],
    ])("maps %s to the expected HTTP error response", async (error, status, message) => {
      const { app, service } = createHarness();
      service.toggleRsvp.mockResolvedValue(Err(error));
      const agent = await signIn(app, "user");

      const response = await agent
        .post("/events/event-rsvp-toggle/rsvp/toggle")
        .set("HX-Request", "true")
        .expect(status);

      expect(response.text).toContain(message);
      expect(service.toggleRsvp).toHaveBeenCalledWith("event-rsvp-toggle", {
        userId: usersByRole.user.id,
        role: "user",
      });
    });

    it("renders the generic 500 response when the service rejects unexpectedly", async () => {
      const { app, service, logger } = createHarness();
      service.toggleRsvp.mockRejectedValue(new Error("template data exploded"));
      const agent = await signIn(app, "user");

      const response = await agent
        .post("/events/event-rsvp-toggle/rsvp/toggle")
        .set("HX-Request", "true")
        .expect(500);

      expect(response.text).toContain("Unable to update RSVP at this time.");
      expect(response.text).not.toContain("template data exploded");
      expect(logger.error).toHaveBeenCalledWith(
        "Unexpected error in RSVP toggle: template data exploded",
      );
    });

    it("passes through decoded unusual event ids and maps not-found results", async () => {
      const { app, service } = createHarness();
      service.toggleRsvp.mockResolvedValue(Err(EventNotFoundError("Event not found.")));
      const agent = await signIn(app, "user");

      const response = await agent.post("/events/%20%20%20/rsvp/toggle").expect(404);

      expect(response.text).toContain("Event not found.");
      expect(service.toggleRsvp).toHaveBeenCalledWith("   ", {
        userId: usersByRole.user.id,
        role: "user",
      });
    });
  });
});
