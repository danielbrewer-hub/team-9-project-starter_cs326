import request from "supertest";
import { createComposedApp } from "../../src/composition";
import {
  DEMO_DRAFT_EVENT_ID,
  DEMO_PUBLISHED_EVENT_ID,
} from "../../src/home/HomeRepository";
import type { ILoggingService } from "../../src/service/LoggingService";

const silentLogger: ILoggingService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function createAgent() {
  const app = createComposedApp(silentLogger).getExpressApp();
  return request.agent(app);
}

async function login(agent: ReturnType<typeof createAgent>, email: string) {
  await agent.post("/login").type("form").send({ email, password: "password123" });
}

describe("GET /events/:id/attendees", () => {
  it("returns 401 when the user is not logged in (HTMX)", async () => {
    const app = createComposedApp(silentLogger).getExpressApp();
    const res = await request(app)
      .get(`/events/${DEMO_PUBLISHED_EVENT_ID}/attendees`)
      .set("HX-Request", "true");

    expect(res.status).toBe(401);
  });

  it("returns 403 for a member who is not the event organizer", async () => {
    const agent = createAgent();
    await login(agent, "user@app.test");

    const res = await agent
      .get(`/events/${DEMO_PUBLISHED_EVENT_ID}/attendees`)
      .set("HX-Request", "true");

    expect(res.status).toBe(403);
  });

  it("returns 403 for staff who is not the organizer of the published demo event", async () => {
    const agent = createAgent();
    await login(agent, "staff@app.test");

    const res = await agent
      .get(`/events/${DEMO_PUBLISHED_EVENT_ID}/attendees`)
      .set("HX-Request", "true");

    expect(res.status).toBe(403);
  });

  it("returns 200 for an admin and includes seeded attendees grouped by status", async () => {
    const agent = createAgent();
    await login(agent, "admin@app.test");

    const res = await agent
      .get(`/events/${DEMO_PUBLISHED_EVENT_ID}/attendees`)
      .set("HX-Request", "true");

    expect(res.status).toBe(200);
    expect(res.text).toContain("event-attendee-list-fragment");
    expect(res.text).toContain('data-attendee-status="attending"');
    expect(res.text).toContain("Avery Admin");
    expect(res.text).toContain('data-attendee-status="waitlisted"');
    expect(res.text).toContain("Sam Staff");
  });

  it("returns 200 for the draft event organizer (staff) on their own event", async () => {
    const agent = createAgent();
    await login(agent, "staff@app.test");

    const res = await agent
      .get(`/events/${DEMO_DRAFT_EVENT_ID}/attendees`)
      .set("HX-Request", "true");

    expect(res.status).toBe(200);
    expect(res.text).toContain("event-attendee-list-fragment");
  });

  it("returns 404 when the event id does not exist", async () => {
    const agent = createAgent();
    await login(agent, "admin@app.test");

    const res = await agent.get("/events/no-such-event/attendees").set("HX-Request", "true");

    expect(res.status).toBe(404);
  });
});
