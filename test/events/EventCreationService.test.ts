import { CreateEventCreationService } from "../../src/events/EventCreationService";
import type { IActingUser, ICreateEventInput } from "../../src/events/EventTypes";
import type {
  ICreateEventInput as IStoredCreateEventInput,
  IEventRecord,
  IHomeContentRepository,
} from "../../src/home/HomeRepository";
import { Ok } from "../../src/lib/result";

const staffActor: IActingUser = {
  userId: "user-staff",
  role: "staff",
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
});
