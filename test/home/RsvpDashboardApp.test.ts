import type { Request, Response } from "express";
import request from "supertest";
import { CreateApp } from "../../src/app";
import type { IAuthController } from "../../src/auth/AuthController";
import type { UserRole } from "../../src/auth/User";
import type { IEventCreationController } from "../../src/events/EventCreationController";
import type { IEventDetailController } from "../../src/events/EventDetailController";
import type { IHomeController } from "../../src/home/HomeController";
import { CreateRsvpDashboardController } from "../../src/home/RsvpDashboardController";
import type {
  IRsvpDashboardData,
  IRsvpDashboardService,
  RsvpDashboardError,
} from "../../src/home/RsvpDashboardService";
import { Err, Ok } from "../../src/lib/result";
import {
  signInAuthenticatedUser,
  type AppSessionStore,
} from "../../src/session/AppSession";
import type { ILoggingService } from "../../src/service/LoggingService";

const silentLogger: ILoggingService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

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
};

const eventDetailController: IEventDetailController = {
  showEventDetail: jest.fn(async (_req, res) => {
    res.status(200).send("event detail");
  }),
  toggleRsvp: jest.fn(async (_req, res) => {
    res.status(200).send("rsvp toggled");
  }),
};

const homeController: IHomeController = {
  showHome: jest.fn(async (_req, res) => {
    res.status(200).send("home");
  }),
};

function createServiceMock(): jest.Mocked<IRsvpDashboardService> {
  return {
    getRsvpDashboardData: jest.fn(),
    cancelRsvp: jest.fn(),
  };
}

function createHarness() {
  const service = createServiceMock();
  const rsvpDashboardController = CreateRsvpDashboardController(service, silentLogger);
  const app = CreateApp(
    new TestAuthController(),
    eventCreationController,
    eventDetailController,
    homeController,
    rsvpDashboardController,
    silentLogger,
  ).getExpressApp();

  return { app, service };
}

async function signIn(
  app: ReturnType<typeof createHarness>["app"],
  role: UserRole,
): Promise<request.Agent> {
  const agent = request.agent(app);
  await agent.post("/login").type("form").send({ role }).expect(302);
  return agent;
}

function validationError(message: string): RsvpDashboardError {
  return { name: "ValidationError", message };
}

function dependencyError(message: string): RsvpDashboardError {
  return { name: "UnexpectedDependencyError", message };
}

const populatedDashboard: IRsvpDashboardData = {
  upcomingRsvps: [
    {
      id: "rsvp-upcoming",
      eventId: "event-upcoming",
      title: "Architecture Review",
      category: "planning",
      location: "CS Building Room 204",
      dateLabel: "Apr 28, 2026",
      timeLabel: "10:00 AM - 11:00 AM",
      rsvpStatus: "going",
      eventStatus: "Published",
    },
  ],
  pastRsvps: [
    {
      id: "rsvp-past",
      eventId: "event-past",
      title: "Launch Retro",
      category: "retro",
      location: "Online",
      dateLabel: "Apr 10, 2026",
      timeLabel: "3:00 PM - 4:00 PM",
      rsvpStatus: "cancelled",
      eventStatus: "Past",
    },
  ],
};

describe("RSVP dashboard app layer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirects unauthenticated dashboard requests to the login page", async () => {
    const { app, service } = createHarness();

    const response = await request(app).get("/rsvp").expect(302);

    expect(response.headers.location).toBe("/login");
    expect(service.getRsvpDashboardData).not.toHaveBeenCalled();
  });

  it("returns the protected-route partial error for unauthenticated cancel requests", async () => {
    const { app, service } = createHarness();

    const response = await request(app).post("/rsvp/rsvp-upcoming/cancel").expect(401);

    expect(response.text).toContain("Please log in to continue.");
    expect(service.cancelRsvp).not.toHaveBeenCalled();
  });

  it.each<UserRole>(["admin", "staff"])(
    "blocks %s users from viewing the member RSVP dashboard",
    async (role) => {
      const { app, service } = createHarness();
      const agent = await signIn(app, role);

      const response = await agent.get("/rsvp").expect(403);

      expect(response.text).toContain("Only users may view RSVP dashboards.");
      expect(service.getRsvpDashboardData).not.toHaveBeenCalled();
    },
  );

  it.each<UserRole>(["admin", "staff"])(
    "blocks %s users from cancelling RSVPs",
    async (role) => {
      const { app, service } = createHarness();
      const agent = await signIn(app, role);

      const response = await agent.post("/rsvp/rsvp-upcoming/cancel").expect(403);

      expect(response.text).toContain("Only users may view RSVP dashboards.");
      expect(service.cancelRsvp).not.toHaveBeenCalled();
    },
  );

  it("renders an empty dashboard for an authenticated member with no RSVPs", async () => {
    const { app, service } = createHarness();
    service.getRsvpDashboardData.mockResolvedValue(
      Ok({ upcomingRsvps: [], pastRsvps: [] }),
    );
    const agent = await signIn(app, "user");

    const response = await agent.get("/rsvp").expect(200);

    expect(response.text).toContain("Your RSVP Dashboard");
    expect(response.text).toContain("You have no upcoming RSVPs at the moment.");
    expect(response.text).toContain("No past or cancelled RSVP history is available yet.");
    expect(response.text).toContain("0 events");
    expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
  });

  it("renders upcoming and past RSVP data for an authenticated member", async () => {
    const { app, service } = createHarness();
    service.getRsvpDashboardData.mockResolvedValue(Ok(populatedDashboard));
    const agent = await signIn(app, "user");

    const response = await agent.get("/rsvp").expect(200);

    expect(response.text).toContain("Architecture Review");
    expect(response.text).toContain("Launch Retro");
    expect(response.text).toContain("RSVP status:");
    expect(response.text).toContain('action="/rsvp/rsvp-upcoming/cancel"');
    expect(response.text).toContain('hx-get="/rsvp/partials/sections"');
    expect(response.text).toContain('hx-trigger="rsvp-dashboard-refresh from:body"');
    expect(response.text).toContain('hx-post="/events/event-upcoming/rsvp/toggle"');
    expect(response.text).toContain('hx-swap="none"');
    expect(response.text).toContain('hx-headers=\'{"HX-RSVP-Dashboard":"true"}\'');
    expect(response.text).toContain('href="/events/event-upcoming"');
    expect(response.text).toContain("Past");
    expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
  });

  it("renders refreshed dashboard sections for an authenticated member", async () => {
    const { app, service } = createHarness();
    service.getRsvpDashboardData.mockResolvedValue(Ok(populatedDashboard));
    const agent = await signIn(app, "user");

    const response = await agent.get("/rsvp/partials/sections").expect(200);

    expect(response.text).toContain('id="rsvp-dashboard-sections"');
    expect(response.text).toContain("Architecture Review");
    expect(response.text).toContain("Launch Retro");
    expect(response.text).not.toContain("Your RSVP Dashboard");
    expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
  });

  it("renders the partial dashboard refresh error when the sections endpoint fails", async () => {
    const { app, service } = createHarness();
    service.getRsvpDashboardData.mockResolvedValue(
      Err(dependencyError("database unavailable")),
    );
    const agent = await signIn(app, "user");

    const response = await agent.get("/rsvp/partials/sections").expect(500);

    expect(response.text).toContain("Unable to refresh the RSVP dashboard right now.");
    expect(response.text).not.toContain("database unavailable");
    expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
  });

  it("renders the generic dashboard load error when the service fails", async () => {
    const { app, service } = createHarness();
    service.getRsvpDashboardData.mockResolvedValue(
      Err(dependencyError("database unavailable")),
    );
    const agent = await signIn(app, "user");

    const response = await agent.get("/rsvp").expect(500);

    expect(response.text).toContain("Your RSVP Dashboard");
    expect(response.text).toContain("Unable to load the RSVP dashboard right now.");
    expect(response.text).not.toContain("database unavailable");
    expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
  });

  it("redirects to the dashboard after a member cancels an RSVP", async () => {
    const { app, service } = createHarness();
    service.cancelRsvp.mockResolvedValue(Ok(undefined));
    const agent = await signIn(app, "user");

    const response = await agent.post("/rsvp/rsvp-upcoming/cancel").expect(302);

    expect(response.headers.location).toBe("/rsvp");
    expect(service.cancelRsvp).toHaveBeenCalledWith("rsvp-upcoming", usersByRole.user);
  });

  it.each([
    ["missing RSVP", "RSVP not found."],
    ["already-cancelled RSVP", "This RSVP has already been cancelled."],
    ["past event RSVP", "Cannot cancel an RSVP for a past or cancelled event."],
  ])("renders a 400 for the %s validation edge case", async (_label, message) => {
    const { app, service } = createHarness();
    service.cancelRsvp.mockResolvedValue(Err(validationError(message)));
    const agent = await signIn(app, "user");

    const response = await agent.post("/rsvp/rsvp-upcoming/cancel").expect(400);

    expect(response.text).toContain("Your RSVP Dashboard");
    expect(response.text).toContain(message);
    expect(service.cancelRsvp).toHaveBeenCalledWith("rsvp-upcoming", usersByRole.user);
  });

  it("passes unusual RSVP ids through to the service and maps validation failures to 400", async () => {
    const { app, service } = createHarness();
    service.cancelRsvp.mockResolvedValue(Err(validationError("RSVP not found.")));
    const agent = await signIn(app, "user");

    await agent.post("/rsvp/%20%20%20/cancel").expect(400);

    expect(service.cancelRsvp).toHaveBeenCalledWith("   ", usersByRole.user);
  });

  it("renders a 500 when cancelling an RSVP fails because of a dependency error", async () => {
    const { app, service } = createHarness();
    service.cancelRsvp.mockResolvedValue(
      Err(dependencyError("Unable to save RSVP status.")),
    );
    const agent = await signIn(app, "user");

    const response = await agent.post("/rsvp/rsvp-upcoming/cancel").expect(500);

    expect(response.text).toContain("Your RSVP Dashboard");
    expect(response.text).toContain("Unable to save RSVP status.");
    expect(service.cancelRsvp).toHaveBeenCalledWith("rsvp-upcoming", usersByRole.user);
  });
});
