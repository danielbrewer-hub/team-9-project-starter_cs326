import request from "supertest";
import type { IEventCreationService } from "../../src/events/EventCreationService";
import { UnexpectedDependencyError } from "../../src/events/errors";
import { Err, Ok } from "../../src/lib/result";
import {
  createEventAppHarness,
  signInAs,
} from "../support/eventAppHarness";

type EventFormValues = {
  title: string;
  description: string;
  location: string;
  category: string;
  capacity: string;
  startDatetime: string;
  endDatetime: string;
};

function toDatetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function eventWindowFromNow(
  daysFromNow: number,
): Pick<EventFormValues, "startDatetime" | "endDatetime"> {
  const start = new Date();
  start.setDate(start.getDate() + daysFromNow);
  start.setHours(14, 0, 0, 0);

  const end = new Date(start);
  end.setHours(15, 0, 0, 0);

  return {
    startDatetime: toDatetimeLocal(start),
    endDatetime: toDatetimeLocal(end),
  };
}

const baseEventForm: EventFormValues = {
  title: "Sprint Demo Prep",
  description: "Practice the demo flow before class.",
  location: "CS Building Room 204",
  category: "demo",
  capacity: "8",
  startDatetime: "",
  endDatetime: "",
};

function validEventForm(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    ...baseEventForm,
    ...eventWindowFromNow(1),
    ...overrides,
  };
}

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
      .send(validEventForm())
      .expect(302);

    expect(createResponse.headers.location).toMatch(/^\/events\/.+/);

    const detailResponse = await agent.get(createResponse.headers.location).expect(200);
    expect(detailResponse.text).toContain("Sprint Demo Prep");
    expect(detailResponse.text).toContain("draft");
  });

  it("renders validation errors with 400 status for bad form input", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent
      .post("/events")
      .type("form")
      .send({
        ...validEventForm(),
        title: "   ",
      })
      .expect(400);

    expect(response.text).toContain("Title is required.");
    expect(response.text).toContain("Practice the demo flow before class.");
  });

  it("maps invalid capacity submissions to 400", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent
      .post("/events")
      .type("form")
      .send({
        ...validEventForm(),
        capacity: "0",
      })
      .expect(400);

    expect(response.text).toContain("Capacity must be a positive whole number.");
  });

  it("maps invalid datetime ordering to 400", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(15, 0, 0, 0);
    const end = new Date(start);
    end.setHours(14, 0, 0, 0);

    const response = await agent
      .post("/events")
      .type("form")
      .send({
        ...validEventForm(),
        startDatetime: toDatetimeLocal(start),
        endDatetime: toDatetimeLocal(end),
      })
      .expect(400);

    expect(response.text).toContain("End time must be after the start time.");
  });

  it("blocks member users from submitting event creation", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "user");

    const response = await agent
      .post("/events")
      .type("form")
      .send(validEventForm())
      .expect(403);

    expect(response.text).toContain("Only organizers and admins can create events.");
  });

  it("maps creation dependency failures to 500", async () => {
    const input = validEventForm();
    const eventCreationService: jest.Mocked<IEventCreationService> = {
      createEvent: jest.fn().mockResolvedValue(
        Err(UnexpectedDependencyError("repository unavailable")),
      ),
      finalizeEdits: jest.fn().mockResolvedValue(Ok(null)),
    };
    const { app } = createEventAppHarness({ eventCreationService });
    const agent = await signInAs(app, "staff");

    const response = await agent
      .post("/events")
      .type("form")
      .send(input)
      .expect(500);

    expect(response.text).toContain("Unable to create the event right now.");
    expect(response.text).not.toContain("repository unavailable");
    expect(eventCreationService.createEvent).toHaveBeenCalledWith(input, {
      userId: "user-staff",
      role: "staff",
    });
  });

  it("returns a success fragment for HTMX creation submissions", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent
      .post("/events")
      .set("HX-Request", "true")
      .type("form")
      .send(validEventForm())
      .expect(201);

    expect(response.text).toContain('id="event-create-panel"');
    expect(response.text).toContain("Draft Saved");
    expect(response.text).toContain("Sprint Demo Prep");
    expect(response.text).toContain("View Event Detail");
    expect(response.text).not.toContain("Feature 1");
  });

  it("returns only the form fragment for HTMX validation failures", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent
      .post("/events")
      .set("HX-Request", "true")
      .type("form")
      .send({
        ...validEventForm(),
        title: "   ",
      })
      .expect(400);

    expect(response.text).toContain('id="event-create-panel"');
    expect(response.text).toContain("Title is required.");
    expect(response.text).toContain("Save Draft Event");
    expect(response.text).not.toContain("Feature 1");
  });

  it("returns only the form fragment for HTMX dependency failures", async () => {
    const eventCreationService: jest.Mocked<IEventCreationService> = {
      createEvent: jest.fn().mockResolvedValue(
        Err(UnexpectedDependencyError("repository unavailable")),
      ),
      finalizeEdits: jest.fn().mockResolvedValue(Ok(null)),
    };
    const { app } = createEventAppHarness({ eventCreationService });
    const agent = await signInAs(app, "staff");

    const response = await agent
      .post("/events")
      .set("HX-Request", "true")
      .type("form")
      .send(validEventForm())
      .expect(500);

    expect(response.text).toContain('id="event-create-panel"');
    expect(response.text).toContain("Unable to create the event right now.");
    expect(response.text).not.toContain("Feature 1");
  });
});
