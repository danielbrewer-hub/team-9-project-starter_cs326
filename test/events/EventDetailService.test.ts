import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { CreateEventDetailService } from "../../src/events/EventDetailService";
import {
  DEMO_DRAFT_EVENT_ID,
  DEMO_PUBLISHED_EVENT_ID,
} from "../../src/home/HomeRepository";
import { CreateInMemoryHomeContentRepository } from "../../src/home/InMemoryHomeRepository";

describe("EventDetailService", () => {
  it("returns published event details for an authenticated member", async () => {
    const service = CreateEventDetailService(
      CreateInMemoryHomeContentRepository(),
      CreateInMemoryUserRepository(),
    );

    const result = await service.getEventDetail(DEMO_PUBLISHED_EVENT_ID, {
      userId: "user-reader",
      role: "user",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(DEMO_PUBLISHED_EVENT_ID);
      expect(result.value.organizerDisplayName).toBe("Avery Admin");
      expect(result.value.attendeeCount).toBe(1);
      expect(result.value.canRsvp).toBe(true);
      expect(result.value.canEdit).toBe(false);
    }
  });

  it("returns not found for missing event ids", async () => {
    const service = CreateEventDetailService(
      CreateInMemoryHomeContentRepository(),
      CreateInMemoryUserRepository(),
    );

    const result = await service.getEventDetail("missing-event", {
      userId: "user-reader",
      role: "user",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventNotFoundError");
    }
  });

  it("hides draft events from non-owner members", async () => {
    const service = CreateEventDetailService(
      CreateInMemoryHomeContentRepository(),
      CreateInMemoryUserRepository(),
    );

    const result = await service.getEventDetail(DEMO_DRAFT_EVENT_ID, {
      userId: "user-reader",
      role: "user",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventNotFoundError");
    }
  });
});
