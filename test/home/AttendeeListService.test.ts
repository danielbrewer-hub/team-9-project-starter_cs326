import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import type { IAuthenticatedUser } from "../../src/auth/User";
import { CreateInMemoryHomeContentRepository } from "../../src/home/InMemoryHomeRepository";
import { CreateAttendeeListService } from "../../src/home/AttendeeListService";

describe("AttendeeListService", () => {
  function asActor(actor: IAuthenticatedUser): IAuthenticatedUser {
    return actor;
  }

  it("returns grouped attendees for an organizer", async () => {
    const users = CreateInMemoryUserRepository();
    const home = CreateInMemoryHomeContentRepository();
    await home.upsertRsvp({
      id: "rsvp-3",
      eventId: "event-1",
      userId: "user-reader",
      status: "cancelled",
    });

    const service = CreateAttendeeListService(home, users);
    const organizer = asActor({
      id: "user-admin",
      email: "admin@app.test",
      displayName: "Avery Admin",
      role: "admin",
    });

    const result = await service.getAttendeeList("event-1", organizer);
    expect(result.ok).toBe(true);
    if (result.ok === false) {
      return;
    }

    expect(result.value.attending.map((entry) => entry.displayName)).toEqual([
      "Avery Admin",
    ]);
    expect(result.value.waitlisted.map((entry) => entry.displayName)).toEqual([
      "Sam Staff",
    ]);
    expect(result.value.cancelled.map((entry) => entry.displayName)).toEqual([
      "Una User",
    ]);
  });

  it("allows an admin to view any event attendee list", async () => {
    const users = CreateInMemoryUserRepository();
    const home = CreateInMemoryHomeContentRepository();
    const service = CreateAttendeeListService(home, users);

    const admin = asActor({
      id: "user-admin",
      email: "admin@app.test",
      displayName: "Avery Admin",
      role: "admin",
    });

    const result = await service.getAttendeeList("event-2", admin);
    expect(result.ok).toBe(true);
    if (result.ok === false) {
      return;
    }

    expect(result.value.attending).toEqual([]);
    expect(result.value.waitlisted).toEqual([]);
    expect(result.value.cancelled).toEqual([]);
  });

  it("blocks members from viewing other attendees", async () => {
    const users = CreateInMemoryUserRepository();
    const home = CreateInMemoryHomeContentRepository();
    const service = CreateAttendeeListService(home, users);

    const member = asActor({
      id: "user-reader",
      email: "user@app.test",
      displayName: "Una User",
      role: "user",
    });

    const result = await service.getAttendeeList("event-1", member);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.value.name).toBe("AuthorizationRequired");
  });
});
