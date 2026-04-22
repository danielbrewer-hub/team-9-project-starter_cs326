import type { IAuthenticatedUser } from "../../src/auth/User";
import type {
  EventStatus,
  ICreateRsvpInput,
  IEventRecord,
  IHomeContentRepository,
  IRsvpRecord,
  RsvpStatus,
} from "../../src/home/HomeRepository";
import { CreateRsvpDashboardService } from "../../src/home/RsvpDashboardService";
import { Err, Ok } from "../../src/lib/result";

const member: IAuthenticatedUser = {
  id: "user-reader",
  email: "user@app.test",
  displayName: "Una User",
  role: "user",
};

function createEvent(
  overrides: Partial<IEventRecord> & Pick<IEventRecord, "id" | "startDatetime">,
): IEventRecord {
  return {
    title: `Event ${overrides.id}`,
    description: "A useful event for testing RSVP dashboard behavior.",
    location: "CS Building Room 204",
    category: "planning",
    status: "published",
    endDatetime: "2026-05-01T13:30:00",
    organizerId: "user-staff",
    createdAt: "2026-04-01T10:00:00",
    updatedAt: "2026-04-01T10:00:00",
    ...overrides,
  };
}

function createRsvp(
  overrides: Partial<IRsvpRecord> & Pick<IRsvpRecord, "id" | "eventId">,
): IRsvpRecord {
  return {
    userId: member.id,
    status: "going",
    createdAt: "2026-04-02T10:00:00",
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

function createHarness() {
  const repository = createRepositoryMock();
  const service = CreateRsvpDashboardService(repository);

  return { repository, service };
}

function seedEventLookups(
  repository: jest.Mocked<IHomeContentRepository>,
  events: IEventRecord[],
): void {
  repository.findEventById.mockImplementation(async (eventId) => {
    return Ok(events.find((event) => event.id === eventId) ?? null);
  });
}

describe("RsvpDashboardService", () => {
  describe("getRsvpDashboardData", () => {
    it("returns empty dashboard sections when the member has no RSVPs", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(Ok([]));

      const result = await service.getRsvpDashboardData(member);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          upcomingRsvps: [],
          pastRsvps: [],
        });
      }
      expect(repository.listRsvpsForUser).toHaveBeenCalledWith(member.id);
      expect(repository.findEventById).not.toHaveBeenCalled();
    });

    it("builds dashboard items, groups them, and sorts upcoming ascending and history descending", async () => {
      const { repository, service } = createHarness();
      const events = [
        createEvent({
          id: "event-upcoming-late",
          title: "May Workshop",
          category: "workshop",
          location: "Design Studio",
          status: "published",
          startDatetime: "2026-05-05T14:00:00",
          endDatetime: "2026-05-05T15:15:00",
        }),
        createEvent({
          id: "event-upcoming-early",
          title: "Morning Planning",
          category: "planning",
          location: "CS Building Room 204",
          status: "draft",
          startDatetime: "2026-05-01T09:00:00",
          endDatetime: "2026-05-01T10:30:00",
        }),
        createEvent({
          id: "event-past-older",
          title: "Older Retro",
          status: "past",
          startDatetime: "2026-04-01T12:00:00",
          endDatetime: "2026-04-01T13:00:00",
        }),
        createEvent({
          id: "event-cancelled",
          title: "Cancelled Demo",
          status: "cancelled",
          startDatetime: "2026-04-20T12:00:00",
          endDatetime: "2026-04-20T13:00:00",
        }),
        createEvent({
          id: "event-rsvp-cancelled",
          title: "Member Cancelled RSVP",
          status: "published",
          startDatetime: "2026-05-12T12:00:00",
          endDatetime: "2026-05-12T13:00:00",
        }),
      ];
      const rsvps = [
        createRsvp({
          id: "rsvp-upcoming-late",
          eventId: "event-upcoming-late",
          status: "going",
        }),
        createRsvp({
          id: "rsvp-upcoming-early",
          eventId: "event-upcoming-early",
          status: "waitlisted",
        }),
        createRsvp({
          id: "rsvp-past-older",
          eventId: "event-past-older",
          status: "going",
        }),
        createRsvp({
          id: "rsvp-cancelled-event",
          eventId: "event-cancelled",
          status: "going",
        }),
        createRsvp({
          id: "rsvp-cancelled",
          eventId: "event-rsvp-cancelled",
          status: "cancelled",
        }),
      ];
      repository.listRsvpsForUser.mockResolvedValue(Ok(rsvps));
      seedEventLookups(repository, events);

      const result = await service.getRsvpDashboardData(member);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.upcomingRsvps.map((rsvp) => rsvp.id)).toEqual([
          "rsvp-upcoming-early",
          "rsvp-upcoming-late",
        ]);
        expect(result.value.pastRsvps.map((rsvp) => rsvp.id)).toEqual([
          "rsvp-cancelled",
          "rsvp-cancelled-event",
          "rsvp-past-older",
        ]);
        expect(result.value.upcomingRsvps[0]).toEqual({
          id: "rsvp-upcoming-early",
          eventId: "event-upcoming-early",
          title: "Morning Planning",
          category: "planning",
          location: "CS Building Room 204",
          dateLabel: "May 1, 2026",
          timeLabel: "9:00 AM - 10:30 AM",
          rsvpStatus: "waitlisted",
          eventStatus: "Draft",
        });
        expect(result.value.upcomingRsvps[1]).toEqual(
          expect.objectContaining({
            title: "May Workshop",
            category: "workshop",
            location: "Design Studio",
            rsvpStatus: "going",
            eventStatus: "Published",
          }),
        );
        expect(result.value.pastRsvps).toEqual([
          expect.objectContaining({
            id: "rsvp-cancelled",
            eventStatus: "Published",
            rsvpStatus: "cancelled",
          }),
          expect.objectContaining({
            id: "rsvp-cancelled-event",
            eventStatus: "Cancelled",
          }),
          expect.objectContaining({
            id: "rsvp-past-older",
            eventStatus: "Past",
          }),
        ]);
      }
      expect(repository.findEventById).toHaveBeenCalledTimes(rsvps.length);
    });

    it("maps RSVP list dependency failures to UnexpectedDependencyError", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Err(new Error("Unable to list RSVPs.")),
      );

      const result = await service.getRsvpDashboardData(member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to list RSVPs.",
        });
      }
      expect(repository.findEventById).not.toHaveBeenCalled();
    });

    it("maps event lookup dependency failures to UnexpectedDependencyError", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Ok([createRsvp({ id: "rsvp-1", eventId: "event-1" })]),
      );
      repository.findEventById.mockResolvedValue(
        Err(new Error("Unable to find event.")),
      );

      const result = await service.getRsvpDashboardData(member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to find event.",
        });
      }
    });

    it("returns UnexpectedDependencyError when an RSVP points to a missing event", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Ok([createRsvp({ id: "rsvp-1", eventId: "event-missing" })]),
      );
      repository.findEventById.mockResolvedValue(Ok(null));

      const result = await service.getRsvpDashboardData(member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to resolve event details for an RSVP.",
        });
      }
    });
  });

  describe("cancelRsvp", () => {
    it.each<RsvpStatus>(["going", "waitlisted"])(
      "cancels an active %s RSVP by upserting a cancelled status",
      async (status) => {
        const { repository, service } = createHarness();
        const rsvp = createRsvp({
          id: `rsvp-${status}`,
          eventId: "event-1",
          status,
        });
        const event = createEvent({
          id: "event-1",
          status: "published",
          startDatetime: "2026-05-01T12:00:00",
          endDatetime: "2026-05-01T13:00:00",
        });
        repository.listRsvpsForUser.mockResolvedValue(Ok([rsvp]));
        repository.findEventById.mockResolvedValue(Ok(event));
        repository.upsertRsvp.mockImplementation(async (input: ICreateRsvpInput) => {
          return Ok({
            ...rsvp,
            status: input.status,
          });
        });

        const result = await service.cancelRsvp(rsvp.id, member);

        expect(result).toEqual(Ok(undefined));
        expect(repository.listRsvpsForUser).toHaveBeenCalledWith(member.id);
        expect(repository.findEventById).toHaveBeenCalledWith("event-1");
        expect(repository.upsertRsvp).toHaveBeenCalledWith({
          id: rsvp.id,
          eventId: rsvp.eventId,
          userId: member.id,
          status: "cancelled",
        });
      },
    );

    it("promotes the earliest waitlisted RSVP when a going RSVP is cancelled", async () => {
      const { repository, service } = createHarness();
      const event = createEvent({
        id: "event-1",
        status: "published",
        startDatetime: "2026-05-01T12:00:00",
        endDatetime: "2026-05-01T13:00:00",
      });
      const cancellingRsvp = createRsvp({
        id: "rsvp-going",
        eventId: "event-1",
        userId: member.id,
        status: "going",
      });
      const waitlistedFirst = createRsvp({
        id: "rsvp-wait-first",
        eventId: "event-1",
        userId: "user-wait-1",
        status: "waitlisted",
        createdAt: "2026-04-02T09:00:00",
      });
      const waitlistedSecond = createRsvp({
        id: "rsvp-wait-second",
        eventId: "event-1",
        userId: "user-wait-2",
        status: "waitlisted",
        createdAt: "2026-04-02T10:00:00",
      });

      repository.listRsvpsForUser.mockResolvedValue(Ok([cancellingRsvp]));
      repository.findEventById.mockResolvedValue(Ok(event));
      repository.listRsvpsForEvent.mockResolvedValue(
        Ok([cancellingRsvp, waitlistedSecond, waitlistedFirst]),
      );
      repository.upsertRsvp
        .mockResolvedValueOnce(Ok({ ...cancellingRsvp, status: "cancelled" }))
        .mockResolvedValueOnce(Ok({ ...waitlistedFirst, status: "going" }));

      const result = await service.cancelRsvp("rsvp-going", member);

      expect(result).toEqual(Ok(undefined));
      expect(repository.listRsvpsForEvent).toHaveBeenCalledWith("event-1");
      expect(repository.upsertRsvp).toHaveBeenNthCalledWith(1, {
        id: "rsvp-going",
        eventId: "event-1",
        userId: member.id,
        status: "cancelled",
      });
      expect(repository.upsertRsvp).toHaveBeenNthCalledWith(2, {
        id: "rsvp-wait-first",
        eventId: "event-1",
        userId: "user-wait-1",
        status: "going",
      });
    });

    it("returns a dependency error when waitlist promotion fails after cancellation attempt", async () => {
      const { repository, service } = createHarness();
      const event = createEvent({
        id: "event-1",
        status: "published",
        startDatetime: "2026-05-01T12:00:00",
        endDatetime: "2026-05-01T13:00:00",
      });
      const cancellingRsvp = createRsvp({
        id: "rsvp-going",
        eventId: "event-1",
        userId: member.id,
        status: "going",
      });
      const waitlistedFirst = createRsvp({
        id: "rsvp-wait-first",
        eventId: "event-1",
        userId: "user-wait-1",
        status: "waitlisted",
        createdAt: "2026-04-02T09:00:00",
      });

      repository.listRsvpsForUser.mockResolvedValue(Ok([cancellingRsvp]));
      repository.findEventById.mockResolvedValue(Ok(event));
      repository.listRsvpsForEvent.mockResolvedValue(Ok([cancellingRsvp, waitlistedFirst]));
      repository.upsertRsvp
        .mockResolvedValueOnce(Ok({ ...cancellingRsvp, status: "cancelled" }))
        .mockResolvedValueOnce(Err(new Error("Unable to promote waitlisted member.")));

      const result = await service.cancelRsvp("rsvp-going", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to promote waitlisted member.",
        });
      }
      expect(repository.upsertRsvp).toHaveBeenCalledTimes(2);
    });

    it("does not attempt promotion when cancelling a going RSVP and the waitlist is empty", async () => {
      const { repository, service } = createHarness();
      const event = createEvent({
        id: "event-1",
        status: "published",
        startDatetime: "2026-05-01T12:00:00",
        endDatetime: "2026-05-01T13:00:00",
      });
      const cancellingRsvp = createRsvp({
        id: "rsvp-going",
        eventId: "event-1",
        userId: member.id,
        status: "going",
      });

      repository.listRsvpsForUser.mockResolvedValue(Ok([cancellingRsvp]));
      repository.findEventById.mockResolvedValue(Ok(event));
      repository.listRsvpsForEvent.mockResolvedValue(Ok([cancellingRsvp]));
      repository.upsertRsvp.mockResolvedValue(Ok({ ...cancellingRsvp, status: "cancelled" }));

      const result = await service.cancelRsvp("rsvp-going", member);

      expect(result).toEqual(Ok(undefined));
      expect(repository.listRsvpsForEvent).toHaveBeenCalledWith("event-1");
      expect(repository.upsertRsvp).toHaveBeenCalledTimes(1);
      expect(repository.upsertRsvp).toHaveBeenCalledWith({
        id: "rsvp-going",
        eventId: "event-1",
        userId: member.id,
        status: "cancelled",
      });
    });

    it("maps RSVP list dependency failures to UnexpectedDependencyError", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Err(new Error("Unable to list RSVPs.")),
      );

      const result = await service.cancelRsvp("rsvp-1", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to list RSVPs.",
        });
      }
      expect(repository.findEventById).not.toHaveBeenCalled();
      expect(repository.upsertRsvp).not.toHaveBeenCalled();
    });

    it.each(["", "rsvp-missing"])(
      "returns ValidationError when RSVP id %p is not found",
      async (rsvpId) => {
        const { repository, service } = createHarness();
        repository.listRsvpsForUser.mockResolvedValue(
          Ok([createRsvp({ id: "rsvp-1", eventId: "event-1" })]),
        );

        const result = await service.cancelRsvp(rsvpId, member);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.value).toEqual({
            name: "ValidationError",
            message: "RSVP not found.",
          });
        }
        expect(repository.findEventById).not.toHaveBeenCalled();
        expect(repository.upsertRsvp).not.toHaveBeenCalled();
      },
    );

    it("returns ValidationError without looking up the event when the RSVP is already cancelled", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Ok([
          createRsvp({
            id: "rsvp-cancelled",
            eventId: "event-1",
            status: "cancelled",
          }),
        ]),
      );

      const result = await service.cancelRsvp("rsvp-cancelled", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "ValidationError",
          message: "This RSVP has already been cancelled.",
        });
      }
      expect(repository.findEventById).not.toHaveBeenCalled();
      expect(repository.upsertRsvp).not.toHaveBeenCalled();
    });

    it("maps event lookup dependency failures to UnexpectedDependencyError", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Ok([createRsvp({ id: "rsvp-1", eventId: "event-1" })]),
      );
      repository.findEventById.mockResolvedValue(
        Err(new Error("Unable to resolve event.")),
      );

      const result = await service.cancelRsvp("rsvp-1", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to resolve event.",
        });
      }
      expect(repository.upsertRsvp).not.toHaveBeenCalled();
    });

    it("returns UnexpectedDependencyError when the RSVP event cannot be found", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Ok([createRsvp({ id: "rsvp-1", eventId: "event-missing" })]),
      );
      repository.findEventById.mockResolvedValue(Ok(null));

      const result = await service.cancelRsvp("rsvp-1", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to resolve event details for the RSVP.",
        });
      }
      expect(repository.upsertRsvp).not.toHaveBeenCalled();
    });

    it.each<EventStatus>(["past", "cancelled"])(
      "returns ValidationError when cancelling an RSVP for a %s event",
      async (status) => {
        const { repository, service } = createHarness();
        repository.listRsvpsForUser.mockResolvedValue(
          Ok([createRsvp({ id: "rsvp-1", eventId: "event-1" })]),
        );
        repository.findEventById.mockResolvedValue(
          Ok(createEvent({ id: "event-1", status, startDatetime: "2026-04-01T12:00:00" })),
        );

        const result = await service.cancelRsvp("rsvp-1", member);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.value).toEqual({
            name: "ValidationError",
            message: "Cannot cancel an RSVP for a past or cancelled event.",
          });
        }
        expect(repository.upsertRsvp).not.toHaveBeenCalled();
      },
    );

    it("maps upsert dependency failures to UnexpectedDependencyError", async () => {
      const { repository, service } = createHarness();
      repository.listRsvpsForUser.mockResolvedValue(
        Ok([createRsvp({ id: "rsvp-1", eventId: "event-1" })]),
      );
      repository.findEventById.mockResolvedValue(
        Ok(createEvent({ id: "event-1", startDatetime: "2026-05-01T12:00:00" })),
      );
      repository.upsertRsvp.mockResolvedValue(
        Err(new Error("Unable to save RSVP.")),
      );

      const result = await service.cancelRsvp("rsvp-1", member);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value).toEqual({
          name: "UnexpectedDependencyError",
          message: "Unable to save RSVP.",
        });
      }
    });
  });
});
