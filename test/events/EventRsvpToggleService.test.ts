import type { IUserRecord, UserRole } from "../../src/auth/User";
import type { IUserRepository } from "../../src/auth/UserRepository";
import { CreateEventDetailService } from "../../src/events/EventDetailService";
import type { IActingUser } from "../../src/events/EventTypes";
import type {
  EventStatus,
  ICreateRsvpInput,
  IEventRecord,
  IHomeContentRepository,
  IRsvpRecord,
  RsvpStatus,
} from "../../src/home/HomeRepository";
import { Err, Ok } from "../../src/lib/result";

const member: IActingUser = {
  userId: "user-reader",
  role: "user",
};

const organizer: IUserRecord = {
  id: "user-staff",
  email: "staff@app.test",
  displayName: "Sam Staff",
  role: "staff",
  passwordHash: "hashed-password",
};

function createEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  return {
    id: "event-rsvp-toggle",
    title: "Architecture Review",
    description: "Discuss the event details RSVP toggle workflow.",
    location: "CS Building Room 204",
    category: "planning",
    status: "published",
    capacity: 10,
    startDatetime: "2026-05-01T14:00:00.000Z",
    endDatetime: "2026-05-01T15:30:00.000Z",
    organizerId: organizer.id,
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
    ...overrides,
  };
}

function createRsvp(overrides: Partial<IRsvpRecord> = {}): IRsvpRecord {
  return {
    id: "rsvp-existing",
    eventId: "event-rsvp-toggle",
    userId: member.userId,
    status: "going",
    createdAt: "2026-04-02T10:00:00.000Z",
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
    cancelAndPromoteNext: jest.fn(),
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

function createHarness() {
  const repository = createRepositoryMock();
  const userRepository = createUserRepositoryMock();
  userRepository.findById.mockResolvedValue(Ok(organizer));
  const service = CreateEventDetailService(repository, userRepository);

  return { repository, userRepository, service };
}

function seedRepositoryState(
  repository: jest.Mocked<IHomeContentRepository>,
  event: IEventRecord,
  rsvps: IRsvpRecord[] = [],
): void {
  repository.findEventById.mockImplementation(async (eventId) => {
    return Ok(eventId === event.id ? event : null);
  });
  repository.listRsvpsForUser.mockImplementation(async (userId) => {
    return Ok(rsvps.filter((rsvp) => rsvp.userId === userId));
  });
  repository.countGoingRsvpsForEvent.mockImplementation(async (eventId) => {
    return Ok(
      rsvps.filter((rsvp) => rsvp.eventId === eventId && rsvp.status === "going").length,
    );
  });
  repository.upsertRsvp.mockImplementation(async (input: ICreateRsvpInput) => {
    const existingIndex = rsvps.findIndex(
      (rsvp) => rsvp.eventId === input.eventId && rsvp.userId === input.userId,
    );
    if (existingIndex >= 0) {
      rsvps[existingIndex] = {
        ...rsvps[existingIndex],
        status: input.status,
      };
      return Ok(rsvps[existingIndex]);
    }

    const created = {
      ...input,
      createdAt: "2026-04-03T10:00:00.000Z",
    };
    rsvps.push(created);
    return Ok(created);
  });
}

describe("EventDetailService RSVP toggle", () => {
  describe("toggleRsvp", () => {
    it.each<UserRole>(["admin", "staff"])(
      "returns EventAuthorizationError for %s actors before reading dependencies",
      async (role) => {
        const { repository, userRepository, service } = createHarness();

        const result = await service.toggleRsvp("event-rsvp-toggle", {
          userId: `${role}-id`,
          role,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.value).toEqual({
            name: "EventAuthorizationError",
            message: "Only members may RSVP for events.",
          });
        }
        expect(repository.findEventById).not.toHaveBeenCalled();
        expect(repository.upsertRsvp).not.toHaveBeenCalled();
        expect(userRepository.findById).not.toHaveBeenCalled();
      },
    );

    it.each(["", "   "])(
      "returns EventNotFoundError for blank event id %p without reading dependencies",
      async (eventId) => {
        const { repository, userRepository, service } = createHarness();

        const result = await service.toggleRsvp(eventId, member);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.value).toEqual({
            name: "EventNotFoundError",
            message: "Event not found.",
          });
        }
        expect(repository.findEventById).not.toHaveBeenCalled();
        expect(repository.upsertRsvp).not.toHaveBeenCalled();
        expect(userRepository.findById).not.toHaveBeenCalled();
      },
    );

    it("normalizes the event id before looking up the event", async () => {
      const { repository, service } = createHarness();
      const event = createEvent();
      seedRepositoryState(repository, event);

      const result = await service.toggleRsvp(`  ${event.id}  `, member);

      expect(result.ok).toBe(true);
      expect(repository.findEventById).toHaveBeenNthCalledWith(1, event.id);
    });

    it.each([
      [
        "event lookup failure",
        (repository: jest.Mocked<IHomeContentRepository>) => {
          repository.findEventById.mockResolvedValue(Err(new Error("Unable to find event.")));
        },
        "Unable to find event.",
      ],
      [
        "RSVP list failure",
        (repository: jest.Mocked<IHomeContentRepository>) => {
          repository.findEventById.mockResolvedValue(Ok(createEvent()));
          repository.listRsvpsForUser.mockResolvedValue(Err(new Error("Unable to list RSVPs.")));
        },
        "Unable to list RSVPs.",
      ],
      [
        "going-count failure",
        (repository: jest.Mocked<IHomeContentRepository>) => {
          repository.findEventById.mockResolvedValue(Ok(createEvent()));
          repository.listRsvpsForUser.mockResolvedValue(Ok([]));
          repository.countGoingRsvpsForEvent.mockResolvedValue(
            Err(new Error("Unable to count RSVPs.")),
          );
        },
        "Unable to count RSVPs.",
      ],
      [
        "upsert failure",
        (repository: jest.Mocked<IHomeContentRepository>) => {
          const event = createEvent();
          repository.findEventById.mockResolvedValue(Ok(event));
          repository.listRsvpsForUser.mockResolvedValue(Ok([]));
          repository.countGoingRsvpsForEvent.mockResolvedValue(Ok(0));
          repository.upsertRsvp.mockResolvedValue(Err(new Error("Unable to save RSVP.")));
        },
        "Unable to save RSVP.",
      ],
    ])("maps %s to UnexpectedDependencyError", async (_label, arrange, message) => {
      const { repository, userRepository, service } = createHarness();
      arrange(repository);

      const result = await service.toggleRsvp("event-rsvp-toggle", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message,
        });
      }
      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it("returns UnexpectedDependencyError when refreshing detail fails after the RSVP is saved", async () => {
      const { repository, userRepository, service } = createHarness();
      const event = createEvent();
      seedRepositoryState(repository, event);
      userRepository.findById.mockResolvedValue(Err({ name: "UnexpectedDependencyError", message: "Unable to load organizer." }));

      const result = await service.toggleRsvp(event.id, member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to load organizer.",
        });
      }
      expect(repository.upsertRsvp).toHaveBeenCalledWith({
        id: `${event.id}-${member.userId}`,
        eventId: event.id,
        userId: member.userId,
        status: "going",
      });
      expect(userRepository.findById).toHaveBeenCalledWith(event.organizerId);
    });

    it("returns UnexpectedDependencyError when the refreshed detail cannot resolve the organizer", async () => {
      const { repository, userRepository, service } = createHarness();
      const event = createEvent();
      seedRepositoryState(repository, event);
      userRepository.findById.mockResolvedValue(Ok(null));

      const result = await service.toggleRsvp(event.id, member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to load the event organizer.",
        });
      }
      expect(repository.upsertRsvp).toHaveBeenCalled();
    });

    it.each<EventStatus>(["draft", "cancelled", "past"])(
      "returns EventNotFoundError when the event is %s",
      async (status) => {
        const { repository, userRepository, service } = createHarness();
        repository.findEventById.mockResolvedValue(Ok(createEvent({ status })));

        const result = await service.toggleRsvp("event-rsvp-toggle", member);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.value).toEqual({
            name: "EventNotFoundError",
            message: "Event not found or not open for RSVP.",
          });
        }
        expect(repository.listRsvpsForUser).not.toHaveBeenCalled();
        expect(repository.upsertRsvp).not.toHaveBeenCalled();
        expect(userRepository.findById).not.toHaveBeenCalled();
      },
    );

    it("returns EventNotFoundError when the event does not exist", async () => {
      const { repository, userRepository, service } = createHarness();
      repository.findEventById.mockResolvedValue(Ok(null));

      const result = await service.toggleRsvp("event-missing", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "EventNotFoundError",
          message: "Event not found or not open for RSVP.",
        });
      }
      expect(repository.listRsvpsForUser).not.toHaveBeenCalled();
      expect(repository.upsertRsvp).not.toHaveBeenCalled();
      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it("creates a going RSVP for an open event with capacity available", async () => {
      const { repository, userRepository, service } = createHarness();
      const event = createEvent({ capacity: 5 });
      const rsvps = [
        createRsvp({ id: "rsvp-other-1", userId: "user-other-1" }),
        createRsvp({ id: "rsvp-other-2", userId: "user-other-2" }),
      ];
      seedRepositoryState(repository, event, rsvps);

      const result = await service.toggleRsvp(event.id, member);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(
          expect.objectContaining({
            id: event.id,
            attendeeCount: 3,
            organizerDisplayName: organizer.displayName,
            canRsvp: true,
            rsvpStatus: "going",
            isFull: false,
          }),
        );
      }
      expect(repository.upsertRsvp).toHaveBeenCalledWith({
        id: `${event.id}-${member.userId}`,
        eventId: event.id,
        userId: member.userId,
        status: "going",
      });
      expect(userRepository.findById).toHaveBeenCalledWith(event.organizerId);
    });

    it("creates a waitlisted RSVP when the event is full", async () => {
      const { repository, service } = createHarness();
      const event = createEvent({ capacity: 2 });
      const rsvps = [
        createRsvp({ id: "rsvp-other-1", userId: "user-other-1" }),
        createRsvp({ id: "rsvp-other-2", userId: "user-other-2" }),
      ];
      seedRepositoryState(repository, event, rsvps);

      const result = await service.toggleRsvp(event.id, member);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(
          expect.objectContaining({
            attendeeCount: 2,
            rsvpStatus: "waitlisted",
            isFull: true,
          }),
        );
      }
      expect(repository.upsertRsvp).toHaveBeenCalledWith({
        id: `${event.id}-${member.userId}`,
        eventId: event.id,
        userId: member.userId,
        status: "waitlisted",
      });
    });

    it("treats events without capacity as available and creates a going RSVP", async () => {
      const { repository, service } = createHarness();
      const event = createEvent({ capacity: undefined });
      const rsvps = [
        createRsvp({ id: "rsvp-other-1", userId: "user-other-1" }),
        createRsvp({ id: "rsvp-other-2", userId: "user-other-2" }),
      ];
      seedRepositoryState(repository, event, rsvps);

      const result = await service.toggleRsvp(event.id, member);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(
          expect.objectContaining({
            attendeeCount: 3,
            rsvpStatus: "going",
            isFull: false,
          }),
        );
      }
      expect(repository.upsertRsvp).toHaveBeenCalledWith({
        id: `${event.id}-${member.userId}`,
        eventId: event.id,
        userId: member.userId,
        status: "going",
      });
    });

    it.each<RsvpStatus>(["going", "waitlisted"])(
      "cancels an existing %s RSVP",
      async (status) => {
        const { repository, service } = createHarness();
        const event = createEvent({ capacity: 3 });
        const rsvps = [
          createRsvp({
            id: `rsvp-${status}`,
            status,
          }),
          createRsvp({
            id: "rsvp-other",
            userId: "user-other",
            status: "going",
          }),
        ];
        seedRepositoryState(repository, event, rsvps);

        const result = await service.toggleRsvp(event.id, member);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(
            expect.objectContaining({
              attendeeCount: 1,
              rsvpStatus: "cancelled",
              isFull: false,
            }),
          );
        }
        expect(repository.upsertRsvp).toHaveBeenCalledWith({
          id: `rsvp-${status}`,
          eventId: event.id,
          userId: member.userId,
          status: "cancelled",
        });
      },
    );

    it("reactivates a cancelled RSVP as going when capacity is available", async () => {
      const { repository, service } = createHarness();
      const event = createEvent({ capacity: 3 });
      const rsvps = [
        createRsvp({
          id: "rsvp-cancelled",
          status: "cancelled",
        }),
      ];
      seedRepositoryState(repository, event, rsvps);

      const result = await service.toggleRsvp(event.id, member);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(
          expect.objectContaining({
            attendeeCount: 1,
            rsvpStatus: "going",
            isFull: false,
          }),
        );
      }
      expect(repository.upsertRsvp).toHaveBeenCalledWith({
        id: "rsvp-cancelled",
        eventId: event.id,
        userId: member.userId,
        status: "going",
      });
    });

    it("reactivates a cancelled RSVP as waitlisted when the event is full", async () => {
      const { repository, service } = createHarness();
      const event = createEvent({ capacity: 1 });
      const rsvps = [
        createRsvp({
          id: "rsvp-cancelled",
          status: "cancelled",
        }),
        createRsvp({
          id: "rsvp-other",
          userId: "user-other",
          status: "going",
        }),
      ];
      seedRepositoryState(repository, event, rsvps);

      const result = await service.toggleRsvp(event.id, member);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(
          expect.objectContaining({
            attendeeCount: 1,
            rsvpStatus: "waitlisted",
            isFull: true,
          }),
        );
      }
      expect(repository.upsertRsvp).toHaveBeenCalledWith({
        id: "rsvp-cancelled",
        eventId: event.id,
        userId: member.userId,
        status: "waitlisted",
      });
    });
  });
});
