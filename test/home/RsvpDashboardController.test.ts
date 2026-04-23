import type { Request, Response } from "express";
import type { IAuthenticatedUser, UserRole } from "../../src/auth/User";
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

const dashboardData: IRsvpDashboardData = {
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

function createServiceMock(): jest.Mocked<IRsvpDashboardService> {
  return {
    getRsvpDashboardData: jest.fn(),
    cancelRsvp: jest.fn(),
  };
}

function createLoggerMock(): jest.Mocked<ILoggingService> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createResponseMock(): jest.Mocked<Pick<Response, "status" | "render" | "redirect">> {
  const response = {
    status: jest.fn(),
    render: jest.fn(),
    redirect: jest.fn(),
  };

  response.status.mockReturnValue(response as unknown as Response);
  response.render.mockReturnValue(response as unknown as Response);
  response.redirect.mockReturnValue(response as unknown as Response);

  return response;
}

function createRequest(user?: IAuthenticatedUser, params: Record<string, unknown> = {}): Request {
  const session = {} as AppSessionStore;
  if (user) {
    signInAuthenticatedUser(session, user);
  }

  return {
    session,
    params,
  } as unknown as Request;
}

function createHarness() {
  const service = createServiceMock();
  const logger = createLoggerMock();
  const controller = CreateRsvpDashboardController(service, logger);
  const res = createResponseMock();

  return { controller, service, logger, res };
}

function validationError(message: string): RsvpDashboardError {
  return { name: "ValidationError", message };
}

function dependencyError(message: string): RsvpDashboardError {
  return { name: "UnexpectedDependencyError", message };
}

describe("RsvpDashboardController", () => {
  describe("showRsvpDashboard", () => {
    it("renders a 401 partial when no authenticated user is in the session", async () => {
      const { controller, service, logger, res } = createHarness();
      const req = createRequest();

      await controller.showRsvpDashboard(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.render).toHaveBeenCalledWith("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      expect(logger.warn).toHaveBeenCalledWith("Blocked unauthenticated request to RSVP dashboard");
      expect(service.getRsvpDashboardData).not.toHaveBeenCalled();
    });

    it.each<UserRole>(["admin", "staff"])(
      "renders a 403 partial for authenticated %s users",
      async (role) => {
        const { controller, service, logger, res } = createHarness();
        const req = createRequest(usersByRole[role]);

        await controller.showRsvpDashboard(req, res as unknown as Response);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.render).toHaveBeenCalledWith("partials/error", {
          message: "Only users may view RSVP dashboards.",
          layout: false,
        });
        expect(logger.warn).toHaveBeenCalledWith("Blocked unauthorized request to RSVP dashboard");
        expect(service.getRsvpDashboardData).not.toHaveBeenCalled();
      },
    );

    it("renders dashboard data for an authenticated member", async () => {
      const { controller, service, logger, res } = createHarness();
      service.getRsvpDashboardData.mockResolvedValue(Ok(dashboardData));
      const req = createRequest(usersByRole.user);

      await controller.showRsvpDashboard(req, res as unknown as Response);

      expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
      expect(res.render).toHaveBeenCalledWith("rsvp", {
        session: expect.objectContaining({
          authenticatedUser: expect.objectContaining({
            userId: usersByRole.user.id,
            email: usersByRole.user.email,
            role: "user",
          }),
          visitCount: 1,
        }),
        pageError: null,
        dashboard: dashboardData,
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("GET /rsvp for Browser"));
    });

    it("renders a generic 500 dashboard error when the service fails", async () => {
      const { controller, service, logger, res } = createHarness();
      service.getRsvpDashboardData.mockResolvedValue(
        Err(dependencyError("repository unavailable")),
      );
      const req = createRequest(usersByRole.user);

      await controller.showRsvpDashboard(req, res as unknown as Response);

      expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.render).toHaveBeenCalledWith("rsvp", {
        session: expect.objectContaining({
          authenticatedUser: expect.objectContaining({ userId: usersByRole.user.id }),
        }),
        pageError: "Unable to load the RSVP dashboard right now.",
        dashboard: null,
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to load RSVP dashboard: repository unavailable",
      );
    });
  });

  describe("cancelRsvp", () => {
    it("renders a 401 partial when no authenticated user is in the session", async () => {
      const { controller, service, logger, res } = createHarness();
      const req = createRequest(undefined, { id: "rsvp-upcoming" });

      await controller.cancelRsvp(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.render).toHaveBeenCalledWith("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      expect(logger.warn).toHaveBeenCalledWith("Blocked unauthenticated request to RSVP dashboard");
      expect(service.cancelRsvp).not.toHaveBeenCalled();
    });

    it.each<UserRole>(["admin", "staff"])(
      "renders a 403 partial for authenticated %s users",
      async (role) => {
        const { controller, service, logger, res } = createHarness();
        const req = createRequest(usersByRole[role], { id: "rsvp-upcoming" });

        await controller.cancelRsvp(req, res as unknown as Response);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.render).toHaveBeenCalledWith("partials/error", {
          message: "Only users may view RSVP dashboards.",
          layout: false,
        });
        expect(logger.warn).toHaveBeenCalledWith("Blocked unauthorized request to RSVP dashboard");
        expect(service.cancelRsvp).not.toHaveBeenCalled();
      },
    );

    it("redirects to the dashboard when a member cancels an RSVP", async () => {
      const { controller, service, logger, res } = createHarness();
      service.cancelRsvp.mockResolvedValue(Ok(undefined));
      const req = createRequest(usersByRole.user, { id: "rsvp-upcoming" });

      await controller.cancelRsvp(req, res as unknown as Response);

      expect(service.cancelRsvp).toHaveBeenCalledWith("rsvp-upcoming", usersByRole.user);
      expect(res.redirect).toHaveBeenCalledWith("/rsvp");
      expect(res.status).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Cancelled RSVP rsvp-upcoming for user@app.test",
      );
    });

    it.each([
      ["missing RSVP", "RSVP not found."],
      ["already-cancelled RSVP", "This RSVP has already been cancelled."],
      ["past event RSVP", "Cannot cancel an RSVP for a past or cancelled event."],
    ])("renders a 400 for the %s validation error", async (_label, message) => {
      const { controller, service, logger, res } = createHarness();
      service.cancelRsvp.mockResolvedValue(Err(validationError(message)));
      const req = createRequest(usersByRole.user, { id: "rsvp-upcoming" });

      await controller.cancelRsvp(req, res as unknown as Response);

      expect(service.cancelRsvp).toHaveBeenCalledWith("rsvp-upcoming", usersByRole.user);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.render).toHaveBeenCalledWith("rsvp", {
        session: expect.objectContaining({
          authenticatedUser: expect.objectContaining({ userId: usersByRole.user.id }),
        }),
        pageError: message,
        dashboard: null,
      });
      expect(logger.warn).toHaveBeenCalledWith(`Cancel RSVP failed: ${message}`);
    });

    it("uses an empty RSVP id when the route parameter is not a string", async () => {
      const { controller, service, res } = createHarness();
      service.cancelRsvp.mockResolvedValue(Err(validationError("RSVP not found.")));
      const req = createRequest(usersByRole.user, {});

      await controller.cancelRsvp(req, res as unknown as Response);

      expect(service.cancelRsvp).toHaveBeenCalledWith("", usersByRole.user);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("renders a 500 and logs with error when a dependency failure occurs", async () => {
      const { controller, service, logger, res } = createHarness();
      service.cancelRsvp.mockResolvedValue(
        Err(dependencyError("Unable to save RSVP status.")),
      );
      const req = createRequest(usersByRole.user, { id: "rsvp-upcoming" });

      await controller.cancelRsvp(req, res as unknown as Response);

      expect(service.cancelRsvp).toHaveBeenCalledWith("rsvp-upcoming", usersByRole.user);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.render).toHaveBeenCalledWith("rsvp", {
        session: expect.objectContaining({
          authenticatedUser: expect.objectContaining({ userId: usersByRole.user.id }),
        }),
        pageError: "Unable to save RSVP status.",
        dashboard: null,
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Cancel RSVP failed: Unable to save RSVP status.",
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        "Cancel RSVP failed: Unable to save RSVP status.",
      );
    });
  });

  describe("renderRsvpDashboardSections", () => {
    it("renders a 401 partial when no authenticated user is in the session", async () => {
      const { controller, service, logger, res } = createHarness();
      const req = createRequest();

      await controller.renderRsvpDashboardSections(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.render).toHaveBeenCalledWith("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      expect(logger.warn).toHaveBeenCalledWith("Blocked unauthenticated request to RSVP dashboard");
      expect(service.getRsvpDashboardData).not.toHaveBeenCalled();
    });

    it.each<UserRole>(["admin", "staff"])(
      "renders a 403 partial for authenticated %s users",
      async (role) => {
        const { controller, service, logger, res } = createHarness();
        const req = createRequest(usersByRole[role]);

        await controller.renderRsvpDashboardSections(req, res as unknown as Response);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.render).toHaveBeenCalledWith("partials/error", {
          message: "Only users may view RSVP dashboards.",
          layout: false,
        });
        expect(logger.warn).toHaveBeenCalledWith("Blocked unauthorized request to RSVP dashboard");
        expect(service.getRsvpDashboardData).not.toHaveBeenCalled();
      },
    );

    it("renders refreshed dashboard sections for an authenticated member", async () => {
      const { controller, service, logger, res } = createHarness();
      service.getRsvpDashboardData.mockResolvedValue(Ok(dashboardData));
      const req = createRequest(usersByRole.user);

      await controller.renderRsvpDashboardSections(req, res as unknown as Response);

      expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
      expect(res.render).toHaveBeenCalledWith("rsvp/partials/dashboard-sections", {
        dashboard: dashboardData,
        layout: false,
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("GET /rsvp/partials/sections for Browser"),
      );
    });

    it("renders a 500 partial when the dashboard refresh fails", async () => {
      const { controller, service, logger, res } = createHarness();
      service.getRsvpDashboardData.mockResolvedValue(
        Err(dependencyError("repository unavailable")),
      );
      const req = createRequest(usersByRole.user);

      await controller.renderRsvpDashboardSections(req, res as unknown as Response);

      expect(service.getRsvpDashboardData).toHaveBeenCalledWith(usersByRole.user);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.render).toHaveBeenCalledWith("partials/error", {
        message: "Unable to refresh the RSVP dashboard right now.",
        layout: false,
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to refresh RSVP dashboard: repository unavailable",
      );
    });
  });
});
