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

  it("returns 404 for missing event ids", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "user");

    const response = await agent.get("/events/event-missing").expect(404);

    expect(response.text).toContain("Event not found.");
  });
});
