import request from "supertest";
import {
  createEventAppHarness,
  signInAs,
} from "../support/eventAppHarness";

const validEventForm = {
  title: "Sprint Demo Prep",
  description: "Practice the demo flow before class.",
  location: "CS Building Room 204",
  category: "demo",
  capacity: "8",
  startDatetime: "2026-05-01T14:00",
  endDatetime: "2026-05-01T15:00",
};

describe("event creation app layer", () => {
  it("redirects unauthenticated users from the creation form to login", async () => {
    const { app } = createEventAppHarness();

    const response = await request(app).get("/events/new").expect(302);

    expect(response.headers.location).toBe("/login");
  });

  it("renders the creation form for staff users", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent.get("/events/new").expect(200);

    expect(response.text).toContain("Create Event");
    expect(response.text).toContain("Save Draft Event");
  });

  it("blocks member users from viewing the creation form", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "user");

    const response = await agent.get("/events/new").expect(403);

    expect(response.text).toContain("Only organizers and admins can create events.");
  });

  it("creates a draft event and redirects the organizer to its detail page", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const createResponse = await agent
      .post("/events")
      .type("form")
      .send(validEventForm)
      .expect(302);

    expect(createResponse.headers.location).toMatch(/^\/events\/.+/);

    const detailResponse = await agent.get(createResponse.headers.location).expect(200);
    expect(detailResponse.text).toContain("Sprint Demo Prep");
    expect(detailResponse.text).toContain("draft");
  });
});
