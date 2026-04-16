import { CreateEventCreationService } from "../../src/events/EventCreationService";
import { CreateInMemoryHomeContentRepository } from "../../src/home/InMemoryHomeRepository";

describe("EventCreationService", () => {
  it("creates a draft event for a staff organizer", async () => {
    const service = CreateEventCreationService(CreateInMemoryHomeContentRepository());

    const result = await service.createEvent(
      {
        title: " Team Design Review ",
        description: " Review the latest UI and service-layer integration. ",
        location: "CS Building Room 301",
        category: "review",
        capacity: "25",
        startDatetime: "2026-04-22T14:00",
        endDatetime: "2026-04-22T15:00",
      },
      {
        userId: "user-staff",
        role: "staff",
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Team Design Review");
      expect(result.value.status).toBe("draft");
      expect(result.value.organizerId).toBe("user-staff");
      expect(result.value.capacity).toBe(25);
    }
  });

  it("rejects invalid capacity values", async () => {
    const service = CreateEventCreationService(CreateInMemoryHomeContentRepository());

    const result = await service.createEvent(
      {
        title: "Workshop",
        description: "A sample event.",
        location: "Campus Center",
        category: "learning",
        capacity: "0",
        startDatetime: "2026-04-22T14:00",
        endDatetime: "2026-04-22T15:00",
      },
      {
        userId: "user-staff",
        role: "staff",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventValidationError");
      expect(result.value.field).toBe("capacity");
    }
  });

  it("rejects events whose end time is not after the start time", async () => {
    const service = CreateEventCreationService(CreateInMemoryHomeContentRepository());

    const result = await service.createEvent(
      {
        title: "Workshop",
        description: "A sample event.",
        location: "Campus Center",
        category: "learning",
        capacity: "",
        startDatetime: "2026-04-22T15:00",
        endDatetime: "2026-04-22T14:00",
      },
      {
        userId: "user-staff",
        role: "staff",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventValidationError");
      expect(result.value.field).toBe("endDatetime");
    }
  });

  it("rejects members who try to create events", async () => {
    const service = CreateEventCreationService(CreateInMemoryHomeContentRepository());

    const result = await service.createEvent(
      {
        title: "Workshop",
        description: "A sample event.",
        location: "Campus Center",
        category: "learning",
        capacity: "",
        startDatetime: "2026-04-22T14:00",
        endDatetime: "2026-04-22T15:00",
      },
      {
        userId: "user-reader",
        role: "user",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventAuthorizationError");
    }
  });

  it("allows blank capacity and stores the event as unlimited", async () => {
    const service = CreateEventCreationService(CreateInMemoryHomeContentRepository());

    const result = await service.createEvent(
      {
        title: "Faculty Meetup",
        description: "Open conversation with no attendance cap.",
        location: "Library Commons",
        category: "networking",
        capacity: "   ",
        startDatetime: "2026-04-25T12:00",
        endDatetime: "2026-04-25T13:00",
      },
      {
        userId: "user-admin",
        role: "admin",
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.capacity).toBeUndefined();
      expect(result.value.organizerId).toBe("user-admin");
    }
  });
});
