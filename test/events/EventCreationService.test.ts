import { CreateEventCreationService } from "../../src/events/EventCreationService";
import type { IActingUser, ICreateEventInput } from "../../src/events/EventTypes";
import type {
  ICreateEventInput as IStoredCreateEventInput,
  IEventRecord,
  IHomeContentRepository,
} from "../../src/home/HomeRepository";
import { Err, Ok } from "../../src/lib/result";

const staffActor: IActingUser = {
  userId: "user-staff",
  role: "staff",
};

const memberActor: IActingUser = {
  userId: "user-reader",
  role: "user",
};

function validInput(overrides: Partial<ICreateEventInput> = {}): ICreateEventInput {
  return {
    title: " Planning Session ",
    description: " Coordinate the next sprint. ",
    location: " CS Building Room 204 ",
    category: " planning ",
    capacity: "12",
    startDatetime: "2026-05-01T14:00",
    endDatetime: "2026-05-01T15:30",
    ...overrides,
  };
}

function createEventRecord(input: IStoredCreateEventInput): IEventRecord {
  return {
    ...input,
    createdAt: "2026-04-21T12:00:00.000Z",
    updatedAt: "2026-04-21T12:00:00.000Z",
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
    cancelGoingRsvpAndPromoteWaitlist: jest.fn(),
  };
}

function createHarness() {
  const repository = createRepositoryMock();
  const service = CreateEventCreationService(repository);

  return { repository, service };
}

describe("EventCreationService", () => {
  it("creates a trimmed draft event owned by the acting organizer", async () => {
    const { repository, service } = createHarness();
    repository.createEvent.mockImplementation(async (input) => Ok(createEventRecord(input)));

    const result = await service.createEvent(validInput(), staffActor);

    expect(result.ok).toBe(true);
    expect(repository.createEvent).toHaveBeenCalledWith({
      id: expect.any(String),
      title: "Planning Session",
      description: "Coordinate the next sprint.",
      location: "CS Building Room 204",
      category: "planning",
      status: "draft",
      capacity: 12,
      startDatetime: new Date("2026-05-01T14:00").toISOString(),
      endDatetime: new Date("2026-05-01T15:30").toISOString(),
      organizerId: "user-staff",
    });
    if (result.ok) {
      expect(result.value.status).toBe("draft");
      expect(result.value.organizerId).toBe("user-staff");
    }
  });

  it("rejects member users before writing to the repository", async () => {
    const { repository, service } = createHarness();

    const result = await service.createEvent(validInput(), memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "EventAuthorizationError",
        message: "Only organizers and admins can create events.",
      });
    }
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it.each<keyof Pick<ICreateEventInput, "title" | "description" | "location" | "category">>([
    "title",
    "description",
    "location",
    "category",
  ])("returns a field validation error when %s is blank", async (field) => {
    const { repository, service } = createHarness();

    const result = await service.createEvent(
      validInput({ [field]: "   " }),
      staffActor,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventValidationError");
      expect(result.value.field).toBe(field);
      expect(result.value.message).toContain("required");
    }
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "2.5", "abc"])(
    "returns a capacity validation error for %p",
    async (capacity) => {
      const { repository, service } = createHarness();

      const result = await service.createEvent(validInput({ capacity }), staffActor);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "EventValidationError",
          message: "Capacity must be a positive whole number.",
          field: "capacity",
        });
      }
      expect(repository.createEvent).not.toHaveBeenCalled();
    },
  );

  it("treats blank capacity as unlimited", async () => {
    const { repository, service } = createHarness();
    repository.createEvent.mockImplementation(async (input) => Ok(createEventRecord(input)));

    const result = await service.createEvent(validInput({ capacity: "   " }), staffActor);

    expect(result.ok).toBe(true);
    expect(repository.createEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ capacity: expect.any(Number) }),
    );
  });

  it.each([
    ["startDatetime", "", "Start time is required."],
    ["startDatetime", "not-a-date", "Start time must be a valid date and time."],
    ["endDatetime", "", "End time is required."],
    ["endDatetime", "not-a-date", "End time must be a valid date and time."],
  ] as const)(
    "returns a datetime validation error for invalid %s value %p",
    async (field, value, message) => {
      const { repository, service } = createHarness();

      const result = await service.createEvent(validInput({ [field]: value }), staffActor);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "EventValidationError",
          message,
          field,
        });
      }
      expect(repository.createEvent).not.toHaveBeenCalled();
    },
  );

  it("requires the end time to be after the start time", async () => {
    const { repository, service } = createHarness();

    const result = await service.createEvent(
      validInput({
        startDatetime: "2026-05-01T15:30",
        endDatetime: "2026-05-01T14:00",
      }),
      staffActor,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "EventValidationError",
        message: "End time must be after the start time.",
        field: "endDatetime",
      });
    }
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it("maps repository write failures to UnexpectedDependencyError", async () => {
    const { repository, service } = createHarness();
    repository.createEvent.mockResolvedValue(Err(new Error("write failed")));

    const result = await service.createEvent(validInput(), staffActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "UnexpectedDependencyError",
        message: "write failed",
      });
    }
  });
});
