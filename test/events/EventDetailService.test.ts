import { UnexpectedDependencyError as AuthDependencyError } from "../../src/auth/errors";
import type { IUserRecord } from "../../src/auth/User";
import type { IUserRepository } from "../../src/auth/UserRepository";
import { CreateEventDetailService } from "../../src/events/EventDetailService";
import type { IActingUser } from "../../src/events/EventTypes";
import type {
  EventStatus,
  IEventRecord,
  IHomeContentRepository,
} from "../../src/home/HomeRepository";
import { Err, Ok } from "../../src/lib/result";

const memberActor: IActingUser = {
  userId: "user-reader",
  role: "user",
};

const ownerActor: IActingUser = {
  userId: "user-staff",
  role: "staff",
};

const adminActor: IActingUser = {
  userId: "user-admin",
  role: "admin",
};

const otherStaffActor: IActingUser = {
  userId: "user-other-staff",
  role: "staff",
};

function createEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  return {
    id: "event-published",
    title: "Architecture Review",
    description: "Review the planned event-board architecture.",
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

function createUser(overrides: Partial<IUserRecord> = {}): IUserRecord {
  return {
    id: "user-staff",
    email: "staff@app.test",
    displayName: "Sam Staff",
    role: "staff",
    passwordHash: "hash",
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
    cancelGoingRsvpAndPromoteWaitlist: jest.fn(),
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
  const service = CreateEventDetailService(repository, userRepository);

  repository.countGoingRsvpsForEvent.mockResolvedValue(Ok(3));
  repository.listRsvpsForUser.mockResolvedValue(Ok([]));
  userRepository.findById.mockResolvedValue(Ok(createUser()));

  return { repository, service, userRepository };
}

describe("EventDetailService", () => {
  it("returns a published event detail view for authenticated members", async () => {
    const { repository, service, userRepository } = createHarness();
    repository.findEventById.mockResolvedValue(Ok(createEvent()));

    const result = await service.getEventDetail("event-published", memberActor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(
        expect.objectContaining({
          id: "event-published",
          title: "Architecture Review",
          organizerDisplayName: "Sam Staff",
          attendeeCount: 3,
          canEdit: false,
          canCancel: false,
          canRsvp: true,
          rsvpStatus: null,
          isFull: false,
        }),
      );
    }
    expect(repository.findEventById).toHaveBeenCalledWith("event-published");
    expect(repository.countGoingRsvpsForEvent).toHaveBeenCalledWith("event-published");
    expect(userRepository.findById).toHaveBeenCalledWith("user-staff");
  });

  it.each(["", "   "])("returns EventNotFoundError for blank event id %p", async (eventId) => {
    const { repository, service, userRepository } = createHarness();

    const result = await service.getEventDetail(eventId, memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "EventNotFoundError",
        message: "Event not found.",
      });
    }
    expect(repository.findEventById).not.toHaveBeenCalled();
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it("returns EventNotFoundError when the event id is missing", async () => {
    const { repository, service, userRepository } = createHarness();
    repository.findEventById.mockResolvedValue(Ok(null));

    const result = await service.getEventDetail("event-missing", memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "EventNotFoundError",
        message: "Event not found.",
      });
    }
    expect(repository.countGoingRsvpsForEvent).not.toHaveBeenCalled();
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it.each([
    ["owning organizer", ownerActor],
    ["admin", adminActor],
  ] as const)("shows drafts to the %s", async (_label, actor) => {
    const { repository, service } = createHarness();
    repository.findEventById.mockResolvedValue(
      Ok(createEvent({ id: "event-draft", status: "draft" })),
    );

    const result = await service.getEventDetail("event-draft", actor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("draft");
      expect(result.value.canEdit).toBe(true);
      expect(result.value.canCancel).toBe(true);
      expect(result.value.canRsvp).toBe(false);
    }
  });

  it.each([
    ["member", memberActor],
    ["non-owning staff user", otherStaffActor],
  ] as const)("hides drafts from a %s as not found", async (_label, actor) => {
    const { repository, service, userRepository } = createHarness();
    repository.findEventById.mockResolvedValue(
      Ok(createEvent({ id: "event-draft", status: "draft" })),
    );

    const result = await service.getEventDetail("event-draft", actor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "EventNotFoundError",
        message: "Event not found.",
      });
    }
    expect(repository.countGoingRsvpsForEvent).not.toHaveBeenCalled();
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it("maps event lookup failures to UnexpectedDependencyError", async () => {
    const { repository, service } = createHarness();
    repository.findEventById.mockResolvedValue(Err(new Error("event lookup failed")));

    const result = await service.getEventDetail("event-published", memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "UnexpectedDependencyError",
        message: "event lookup failed",
      });
    }
    expect(repository.countGoingRsvpsForEvent).not.toHaveBeenCalled();
  });

  it("maps attendee-count failures to UnexpectedDependencyError", async () => {
    const { repository, service, userRepository } = createHarness();
    repository.findEventById.mockResolvedValue(Ok(createEvent()));
    repository.countGoingRsvpsForEvent.mockResolvedValue(
      Err(new Error("count failed")),
    );

    const result = await service.getEventDetail("event-published", memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "UnexpectedDependencyError",
        message: "count failed",
      });
    }
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it("maps organizer lookup failures to UnexpectedDependencyError", async () => {
    const { repository, service, userRepository } = createHarness();
    repository.findEventById.mockResolvedValue(Ok(createEvent()));
    userRepository.findById.mockResolvedValue(
      Err(AuthDependencyError("user lookup failed")),
    );

    const result = await service.getEventDetail("event-published", memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "UnexpectedDependencyError",
        message: "user lookup failed",
      });
    }
  });

  it("returns UnexpectedDependencyError when the organizer is missing", async () => {
    const { repository, service, userRepository } = createHarness();
    repository.findEventById.mockResolvedValue(Ok(createEvent()));
    userRepository.findById.mockResolvedValue(Ok(null));

    const result = await service.getEventDetail("event-published", memberActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value).toEqual({
        name: "UnexpectedDependencyError",
        message: "Unable to load the event organizer.",
      });
    }
  });

  it.each<EventStatus>(["cancelled", "past"])(
    "allows authenticated users to view %s events",
    async (status) => {
      const { repository, service } = createHarness();
      repository.findEventById.mockResolvedValue(Ok(createEvent({ status })));

      const result = await service.getEventDetail("event-published", memberActor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe(status);
        expect(result.value.canRsvp).toBe(false);
      }
    },
  );
});
