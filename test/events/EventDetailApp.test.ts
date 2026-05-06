import request from "supertest";
import type { IEventDetailService } from "../../src/events/EventDetailService";
import { UnexpectedDependencyError } from "../../src/events/errors";
import {
  DEMO_DRAFT_EVENT_ID,
  DEMO_PUBLISHED_EVENT_ID,
} from "../../src/home/HomeRepository";
import { Err } from "../../src/lib/result";
import {
  createEventAppHarness,
  signInAs,
} from "../support/eventAppHarness";

describe("event detail app layer", () => {
  it("redirects unauthenticated detail requests to login", async () => {
    const { app } = createEventAppHarness();

    const response = await request(app)
      .get(`/events/${DEMO_PUBLISHED_EVENT_ID}`)
      .expect(302);

    expect(response.headers.location).toBe("/login");
  });

  it("renders published event details for authenticated members", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "user");

    const response = await agent.get(`/events/${DEMO_PUBLISHED_EVENT_ID}`).expect(200);

    expect(response.text).toContain("Sprint Planning Workshop");
    expect(response.text).toContain("Avery Admin");
    expect(response.text).toContain("1 / 12 attending");
    expect(response.text).toContain("RSVP Going");
  });

  it("renders the authoritative start date with a relative time enhancement", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "user");

    const response = await agent.get(`/events/${DEMO_PUBLISHED_EVENT_ID}`).expect(200);

    expect(response.text).toContain('<time datetime="2026-04-18T14:00:00.000Z">');
    expect(response.text).toContain("relativeStartTime");
    expect(response.text).toContain("updateRelativeStartTime");
    expect(response.text).toContain("Intl.RelativeTimeFormat");
    expect(response.text).toContain('x-text="relativeStartTime"');
  });

  it("returns 404 for missing event ids", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "user");

    const response = await agent.get("/events/event-missing").expect(404);

    expect(response.text).toContain("Event not found.");
  });

  it("renders draft event details for the owning organizer", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent.get(`/events/${DEMO_DRAFT_EVENT_ID}`).expect(200);

    expect(response.text).toContain("Project Demo Dry Run");
    expect(response.text).toContain("draft");
    expect(response.text).toContain("Edit Event");
  });

  it("renders draft event details for admins", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "admin");

    const response = await agent.get(`/events/${DEMO_DRAFT_EVENT_ID}`).expect(200);

    expect(response.text).toContain("Project Demo Dry Run");
    expect(response.text).toContain("draft");
    expect(response.text).toContain("Edit Event");
  });

  it("hides draft events from member users as not found", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "user");

    const response = await agent.get(`/events/${DEMO_DRAFT_EVENT_ID}`).expect(404);

    expect(response.text).toContain("Event not found.");
    expect(response.text).not.toContain("Project Demo Dry Run");
  });

  it("maps event detail dependency failures to 500", async () => {
    const eventDetailService: jest.Mocked<IEventDetailService> = {
      getEventDetail: jest.fn().mockResolvedValue(
        Err(UnexpectedDependencyError("detail dependency failed")),
      ),
      toggleRsvp: jest.fn(),
    };
    const { app } = createEventAppHarness({ eventDetailService });
    const agent = await signInAs(app, "user");

    const response = await agent.get(`/events/${DEMO_PUBLISHED_EVENT_ID}`).expect(500);

    expect(response.text).toContain("Unable to load the event right now.");
    expect(response.text).not.toContain("detail dependency failed");
    expect(eventDetailService.getEventDetail).toHaveBeenCalledWith(
      DEMO_PUBLISHED_EVENT_ID,
      {
        userId: "user-reader",
        role: "user",
      },
    );
  });
});
