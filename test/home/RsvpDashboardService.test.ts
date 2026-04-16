import { CreateInMemoryHomeContentRepository } from "../../src/home/InMemoryHomeRepository";
import { CreateRsvpDashboardService } from "../../src/home/RsvpDashboardService";

describe("RsvpDashboardService", () => {
  it("promotes the earliest waitlisted RSVP when a going RSVP is cancelled", async () => {
    const repository = CreateInMemoryHomeContentRepository();
    const service = CreateRsvpDashboardService(repository);
    const eventId = `event-promotion-${Date.now()}`;
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    await repository.createEvent({
      id: eventId,
      title: "Promotion Test Event",
      description: "Test waitlist promotion behavior",
      location: "Online",
      category: "test",
      status: "published",
      startDatetime: start,
      endDatetime: end,
      organizerId: "user-admin",
    });
    await repository.upsertRsvp({
      id: "promotion-going",
      eventId,
      userId: "user-admin",
      status: "going",
    });
    await repository.upsertRsvp({
      id: "promotion-waitlisted-1",
      eventId,
      userId: "user-staff",
      status: "waitlisted",
    });
    await repository.upsertRsvp({
      id: "promotion-waitlisted-2",
      eventId,
      userId: "user-member-2",
      status: "waitlisted",
    });

    const adminActor = {
      id: "user-admin",
      email: "admin@app.test",
      displayName: "Avery Admin",
      role: "user" as const,
    };

    const cancelResult = await service.cancelRsvp("promotion-going", adminActor);
    expect(cancelResult.ok).toBe(true);

    const eventRsvps = await repository.listRsvpsForEvent(eventId);
    expect(eventRsvps.ok).toBe(true);
    if (eventRsvps.ok) {
      const promotedRsvp = eventRsvps.value.find((entry) => entry.id === "promotion-waitlisted-1");
      const stillWaitlisted = eventRsvps.value.find((entry) => entry.id === "promotion-waitlisted-2");
      expect(promotedRsvp?.status).toBe("going");
      expect(stillWaitlisted?.status).toBe("waitlisted");
    }
  });

  it("includes waitlist position in dashboard data", async () => {
    const repository = CreateInMemoryHomeContentRepository();
    const service = CreateRsvpDashboardService(repository);
    const eventId = `event-position-${Date.now()}`;
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    await repository.createEvent({
      id: eventId,
      title: "Position Test Event",
      description: "Test waitlist positions",
      location: "Campus",
      category: "test",
      status: "published",
      startDatetime: start,
      endDatetime: end,
      organizerId: "user-admin",
    });
    await repository.upsertRsvp({
      id: "position-user-staff",
      eventId,
      userId: "user-staff",
      status: "waitlisted",
    });
    await repository.upsertRsvp({
      id: "position-user-member-2",
      eventId,
      userId: "user-member-2",
      status: "waitlisted",
    });

    const waitlistedActor = {
      id: "user-staff",
      email: "staff@app.test",
      displayName: "Sam Staff",
      role: "user" as const,
    };

    const result = await service.getRsvpDashboardData(waitlistedActor);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const waitlistedItem = result.value.upcomingRsvps.find(
        (item) => item.id === "position-user-staff",
      );
      expect(waitlistedItem?.rsvpStatus).toBe("waitlisted");
      expect(waitlistedItem?.waitlistPosition).toBe(1);
    }
  });
});
