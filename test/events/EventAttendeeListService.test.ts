import type { IUserRecord } from "../../src/auth/User";
import type { IUserRepository } from "../../src/auth/UserRepository";
import { CreateEventAttendeeListService } from "../../src/events/EventAttendeeListService";
import type {
  IEventRecord,
  IHomeContentRepository,
  IRsvpRecord,
} from "../../src/home/HomeRepository";
import { Err, Ok } from "../../src/lib/result";

const organizerStaffId = "user-staff";
const adminId = "user-admin";
const memberId = "user-reader";

const organizerActor = { userId: organizerStaffId, role: "staff" as const };
const adminActor = { userId: adminId, role: "admin" as const };
const memberActor = { userId: memberId, role: "user" as const };

function createEvent(overrides: Partial<IEventRecord> & Pick<IEventRecord, "id">): IEventRecord {
  return {
    title: "Test Event",
    description: "Desc",
    location: "Here",
    category: "meetup",
    status: "published",
    startDatetime: "2026-06-01T10:00:00",
    endDatetime: "2026-06-01T11:00:00",
    organizerId: organizerStaffId,
    createdAt: "2026-04-01T10:00:00",
    updatedAt: "2026-04-01T10:00:00",
    ...overrides,
  };
}

function userRecord(
  id: string,
  displayName: string,
  role: IUserRecord["role"] = "user",
): IUserRecord {
  return {
    id,
    email: `${id}@test.local`,
    displayName,
    role,
    passwordHash: "x",
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

function createUserRepositoryMock(): jest.Mocked<IUserRepository> {
  return {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    listUsers: jest.fn(),
    createUser: jest.fn(),
    deleteUser: jest.fn(),
  };
}

describe("EventAttendeeListService", () => {
  describe("getAttendeeList", () => {
    it("returns EventNotFoundError when the event id is empty", async () => {
      const content = createRepositoryMock();
      const users = createUserRepositoryMock();
      const service = CreateEventAttendeeListService(content, users);

      const result = await service.getAttendeeList("   ", adminActor);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotFoundError");
      }
      expect(content.findEventById).not.toHaveBeenCalled();
    });

    it("returns EventNotFoundError when the event does not exist", async () => {
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(null));
      const users = createUserRepositoryMock();
      const service = CreateEventAttendeeListService(content, users);

      const result = await service.getAttendeeList("missing-event", adminActor);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotFoundError");
      }
    });

    it("returns EventAuthorizationError when a member who is not the organizer requests the list", async () => {
      const event = createEvent({ id: "evt-1" });
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      const users = createUserRepositoryMock();
      const service = CreateEventAttendeeListService(content, users);

      const result = await service.getAttendeeList("evt-1", memberActor);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventAuthorizationError");
      }
      expect(content.listRsvpsForEvent).not.toHaveBeenCalled();
    });

    it("allows the event organizer to load the attendee list", async () => {
      const event = createEvent({ id: "evt-org" });
      const rsvps: IRsvpRecord[] = [
        {
          id: "r1",
          eventId: "evt-org",
          userId: memberId,
          status: "going",
          createdAt: "2026-04-10T12:00:00",
        },
      ];
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      content.listRsvpsForEvent.mockResolvedValue(Ok(rsvps));
      const users = createUserRepositoryMock();
      users.findById.mockImplementation(async (id) => Ok(userRecord(id, "Una User")));

      const service = CreateEventAttendeeListService(content, users);
      const result = await service.getAttendeeList("evt-org", organizerActor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.attending).toEqual([
          { displayName: "Una User", rsvpedAt: "2026-04-10T12:00:00" },
        ]);
        expect(result.value.waitlisted).toEqual([]);
        expect(result.value.cancelled).toEqual([]);
      }
    });

    it("allows an admin to load the attendee list for any event", async () => {
      const event = createEvent({ id: "evt-admin", organizerId: "someone-else" });
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      content.listRsvpsForEvent.mockResolvedValue(Ok([]));
      const users = createUserRepositoryMock();
      const service = CreateEventAttendeeListService(content, users);

      const result = await service.getAttendeeList("evt-admin", adminActor);

      expect(result.ok).toBe(true);
      expect(content.listRsvpsForEvent).toHaveBeenCalledWith("evt-admin");
    });

    it("groups RSVPs by attending, waitlisted, and cancelled", async () => {
      const event = createEvent({ id: "evt-mix" });
      const rsvps: IRsvpRecord[] = [
        {
          id: "r-going",
          eventId: "evt-mix",
          userId: "u1",
          status: "going",
          createdAt: "2026-04-10T10:00:00",
        },
        {
          id: "r-wait",
          eventId: "evt-mix",
          userId: "u2",
          status: "waitlisted",
          createdAt: "2026-04-10T11:00:00",
        },
        {
          id: "r-cancel",
          eventId: "evt-mix",
          userId: "u3",
          status: "cancelled",
          createdAt: "2026-04-10T09:00:00",
        },
      ];
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      content.listRsvpsForEvent.mockResolvedValue(Ok(rsvps));
      const users = createUserRepositoryMock();
      users.findById.mockImplementation(async (id) => {
        const names: Record<string, string> = {
          u1: "Alice",
          u2: "Bob",
          u3: "Carol",
        };
        return Ok(userRecord(id, names[id] ?? id));
      });

      const service = CreateEventAttendeeListService(content, users);
      const result = await service.getAttendeeList("evt-mix", adminActor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.attending.map((r) => r.displayName)).toEqual(["Alice"]);
        expect(result.value.waitlisted.map((r) => r.displayName)).toEqual(["Bob"]);
        expect(result.value.cancelled.map((r) => r.displayName)).toEqual(["Carol"]);
      }
    });

    it("sorts each group by RSVP createdAt ascending", async () => {
      const event = createEvent({ id: "evt-sort" });
      const rsvps: IRsvpRecord[] = [
        {
          id: "r-late",
          eventId: "evt-sort",
          userId: "u-late",
          status: "going",
          createdAt: "2026-04-10T15:00:00",
        },
        {
          id: "r-early",
          eventId: "evt-sort",
          userId: "u-early",
          status: "going",
          createdAt: "2026-04-10T09:00:00",
        },
        {
          id: "r-mid",
          eventId: "evt-sort",
          userId: "u-mid",
          status: "going",
          createdAt: "2026-04-10T12:00:00",
        },
      ];
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      content.listRsvpsForEvent.mockResolvedValue(Ok(rsvps));
      const users = createUserRepositoryMock();
      users.findById.mockImplementation(async (id) => Ok(userRecord(id, id)));

      const service = CreateEventAttendeeListService(content, users);
      const result = await service.getAttendeeList("evt-sort", organizerActor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.attending.map((r) => r.rsvpedAt)).toEqual([
          "2026-04-10T09:00:00",
          "2026-04-10T12:00:00",
          "2026-04-10T15:00:00",
        ]);
      }
    });

    it("sorts the waitlisted group by RSVP createdAt ascending (same rule as other buckets)", async () => {
      const event = createEvent({ id: "evt-sort-wait" });
      const rsvps: IRsvpRecord[] = [
        {
          id: "w2",
          eventId: "evt-sort-wait",
          userId: "u-b",
          status: "waitlisted",
          createdAt: "2026-04-11T18:00:00",
        },
        {
          id: "w1",
          eventId: "evt-sort-wait",
          userId: "u-a",
          status: "waitlisted",
          createdAt: "2026-04-11T08:00:00",
        },
      ];
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      content.listRsvpsForEvent.mockResolvedValue(Ok(rsvps));
      const users = createUserRepositoryMock();
      users.findById.mockImplementation(async (id) => Ok(userRecord(id, id)));

      const service = CreateEventAttendeeListService(content, users);
      const result = await service.getAttendeeList("evt-sort-wait", organizerActor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.waitlisted.map((r) => r.rsvpedAt)).toEqual([
          "2026-04-11T08:00:00",
          "2026-04-11T18:00:00",
        ]);
      }
    });

    it("returns UnexpectedDependencyError when a user record is missing for an RSVP", async () => {
      const event = createEvent({ id: "evt-user" });
      const rsvps: IRsvpRecord[] = [
        {
          id: "r1",
          eventId: "evt-user",
          userId: "ghost",
          status: "going",
          createdAt: "2026-04-10T12:00:00",
        },
      ];
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      content.listRsvpsForEvent.mockResolvedValue(Ok(rsvps));
      const users = createUserRepositoryMock();
      users.findById.mockResolvedValue(Ok(null));

      const service = CreateEventAttendeeListService(content, users);
      const result = await service.getAttendeeList("evt-user", organizerActor);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("UnexpectedDependencyError");
      }
    });

    it("returns UnexpectedDependencyError when listRsvpsForEvent fails", async () => {
      const event = createEvent({ id: "evt-rsvp-fail" });
      const content = createRepositoryMock();
      content.findEventById.mockResolvedValue(Ok(event));
      content.listRsvpsForEvent.mockResolvedValue(Err(new Error("storage")));
      const users = createUserRepositoryMock();
      const service = CreateEventAttendeeListService(content, users);

      const result = await service.getAttendeeList("evt-rsvp-fail", adminActor);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("UnexpectedDependencyError");
      }
    });
  });
});
