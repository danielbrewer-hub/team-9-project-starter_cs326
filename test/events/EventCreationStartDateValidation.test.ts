import request from "supertest";
import { CreateEventCreationService } from "../../src/events/EventCreationService";
import type { IActingUser, ICreateEventInput } from "../../src/events/EventTypes";
import type { IHomeContentRepository } from "../../src/home/HomeRepository";
import {
  createEventAppHarness,
  signInAs,
} from "../support/eventAppHarness";

const staffActor: IActingUser = {
  userId: "user-staff",
  role: "staff",
};

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

function eventWindowFromNow(daysFromNow: number): Pick<EventFormValues, "startDatetime" | "endDatetime"> {
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

function validEventForm(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: "Sprint Demo Prep",
    description: "Practice the demo flow before class.",
    location: "CS Building Room 204",
    category: "demo",
    capacity: "8",
    ...eventWindowFromNow(1),
    ...overrides,
  };
}

function validServiceInput(overrides: Partial<ICreateEventInput> = {}): ICreateEventInput {
  return {
    title: "Planning Session",
    description: "Coordinate the next sprint.",
    location: "CS Building Room 204",
    category: "planning",
    capacity: "12",
    ...eventWindowFromNow(1),
    ...overrides,
  };
}

function createRepositoryMock(): jest.Mocked<IHomeContentRepository> {
  return {
    listEvents: jest.fn(),
    findEventById: jest.fn(),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    listRsvpsForEvent: jest.fn(),
    countGoingRsvpsForEvent: jest.fn(),
    listRsvpsForUser: jest.fn(),
    upsertRsvp: jest.fn(),
  };
}

describe("event creation start date validation", () => {
  it("rejects past start times before writing to the repository", async () => {
    const repository = createRepositoryMock();
    const service = CreateEventCreationService(repository);

    const result = await service.createEvent(
      validServiceInput(eventWindowFromNow(-1)),
      staffActor,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "EventValidationError",
        message: "Start time must be in the future.",
        field: "startDatetime",
      });
    }
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it("maps past start time submissions to a 400 response", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent
      .post("/events")
      .type("form")
      .send(validEventForm(eventWindowFromNow(-1)))
      .expect(400);

    expect(response.text).toContain("Start time must be in the future.");
  });

  it("still redirects unauthenticated users before validating submitted dates", async () => {
    const { app } = createEventAppHarness();

    const response = await request(app)
      .post("/events")
      .type("form")
      .send(validEventForm(eventWindowFromNow(-1)))
      .expect(401);

    expect(response.text).toContain("Please log in to continue.");
  });
});
