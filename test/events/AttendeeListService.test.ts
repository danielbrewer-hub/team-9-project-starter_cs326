import { CreateAttendeeListService } from "../../src/events/AttendeeListService";
import type { IActingUser } from "../../src/events/EventTypes";
import type {
  IEventRecord,
  IHomeContentRepository,
  IRsvpAttendeeRow,
} from "../../src/home/HomeRepository";
import { Err, Ok } from "../../src/lib/result";

const adminActor: IActingUser = { userId: "user-admin", role: "admin" };
const organizerStaffActor: IActingUser = { userId: "user-staff", role: "staff" };
const memberActor: IActingUser = { userId: "user-reader", role: "user" };
const otherStaffActor: IActingUser = { userId: "user-other", role: "staff" };

function createEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  return {
    id: "event-published",
    title: "Architecture Review",
    description: "Review RSVP flows.",
    location: "CS Building Room 204",
    category: "planning",
    status: "published",
    capacity: 20,
    startDatetime: "2026-05-01T14:00:00.000Z",
    endDatetime: "2026-05-01T15:00:00.000Z",
    organizerId: "user-staff",
    createdAt: "2026-04-21T12:00:00.000Z",
    updatedAt: "2026-04-21T12:00:00.000Z",
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
    listRsvpsWithAttendeeDetailsForEvent: jest.fn(),
    countGoingRsvpsForEvent: jest.fn(),
    listRsvpsForUser: jest.fn(),
    upsertRsvp: jest.fn(),
  };
}

describe("AttendeeListService", () => {
  it("allows the event organizer to load grouped RSVPs ordered within each bucket", async () => {
    const repository = createRepositoryMock();
    const service = CreateAttendeeListService(repository);

    const event = createEvent();
    repository.findEventById.mockResolvedValue(Ok(event));

    const rows: IRsvpAttendeeRow[] = [
      {
        displayName: "Early Wait",
        status: "waitlisted",
        createdAt: "2026-04-02T10:00:00.000Z",
      },
      {
        displayName: "First Going",
        status: "going",
        createdAt: "2026-04-01T10:00:00.000Z",
      },
      {
        displayName: "Second Going",
        status: "going",
        createdAt: "2026-04-03T10:00:00.000Z",
      },
      {
        displayName: "Dropped",
        status: "cancelled",
        createdAt: "2026-04-04T10:00:00.000Z",
      },
    ];
    repository.listRsvpsWithAttendeeDetailsForEvent.mockResolvedValue(Ok(rows));

    const result = await service.getAttendeeList("event-published", organizerStaffActor);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.attending.map((r) => r.displayName)).toEqual(["First Going", "Second Going"]);
    expect(result.value.waitlisted.map((r) => r.displayName)).toEqual(["Early Wait"]);
    expect(result.value.cancelled.map((r) => r.displayName)).toEqual(["Dropped"]);
    expect(repository.listRsvpsWithAttendeeDetailsForEvent).toHaveBeenCalledWith("event-published");
  });

  it("allows admins even when they are not the organizer", async () => {
    const repository = createRepositoryMock();
    const service = CreateAttendeeListService(repository);

    repository.findEventById.mockResolvedValue(Ok(createEvent()));
    repository.listRsvpsWithAttendeeDetailsForEvent.mockResolvedValue(
      Ok([
        {
          displayName: "Only Member",
          status: "going",
          createdAt: "2026-04-01T10:00:00.000Z",
        },
      ]),
    );

    const result = await service.getAttendeeList("event-published", adminActor);

    expect(result.ok).toBe(true);
  });

  it("denies members who are not the organizer", async () => {
    const repository = createRepositoryMock();
    const service = CreateAttendeeListService(repository);

    repository.findEventById.mockResolvedValue(Ok(createEvent()));

    const result = await service.getAttendeeList("event-published", memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventAuthorizationError");
    }
    expect(repository.listRsvpsWithAttendeeDetailsForEvent).not.toHaveBeenCalled();
  });

  it("denies staff who can view the event but do not organize it", async () => {
    const repository = createRepositoryMock();
    const service = CreateAttendeeListService(repository);

    repository.findEventById.mockResolvedValue(Ok(createEvent()));

    const result = await service.getAttendeeList("event-published", otherStaffActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventAuthorizationError");
    }
    expect(repository.listRsvpsWithAttendeeDetailsForEvent).not.toHaveBeenCalled();
  });

  it("returns not found when the event does not exist", async () => {
    const repository = createRepositoryMock();
    const service = CreateAttendeeListService(repository);

    repository.findEventById.mockResolvedValue(Ok(null));

    const result = await service.getAttendeeList("missing", adminActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventNotFoundError");
    }
  });

  it("returns not found when the actor cannot view the event", async () => {
    const repository = createRepositoryMock();
    const service = CreateAttendeeListService(repository);

    repository.findEventById.mockResolvedValue(
      Ok(createEvent({ id: "draft-ev", status: "draft" })),
    );

    const result = await service.getAttendeeList("draft-ev", memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventNotFoundError");
    }
    expect(repository.listRsvpsWithAttendeeDetailsForEvent).not.toHaveBeenCalled();
  });

  it("maps attendee-detail failures to UnexpectedDependencyError", async () => {
    const repository = createRepositoryMock();
    const service = CreateAttendeeListService(repository);

    repository.findEventById.mockResolvedValue(Ok(createEvent()));
    repository.listRsvpsWithAttendeeDetailsForEvent.mockResolvedValue(
      Err(new Error("database unavailable")),
    );

    const result = await service.getAttendeeList("event-published", adminActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "UnexpectedDependencyError",
        message: "database unavailable",
      });
    }
  });
});
