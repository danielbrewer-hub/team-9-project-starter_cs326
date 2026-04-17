import { CreateHomeService } from "../../src/home/HomeService";
import {
  CreateInMemoryHomeContentRepository,
} from "../../src/home/InMemoryHomeRepository";
import type { IAuthenticatedUser } from "../../src/auth/User";

function createActor(
  overrides: Partial<IAuthenticatedUser>,
): IAuthenticatedUser {
  return {
    id: "user-reader",
    email: "user@app.test",
    displayName: "Una User",
    role: "user",
    ...overrides,
  };
}

describe("HomeService", () => {
  it("hides draft events from non-organizer members", async () => {
    const service = CreateHomeService(CreateInMemoryHomeContentRepository());

    const result = await service.getHomePageData(createActor({}));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventSummary).toContain("1 total events");
      expect(result.value.recentEvents.map((event) => event.id)).toEqual(["event-1"]);
    }
  });

  it("shows draft events to the organizer who owns them", async () => {
    const service = CreateHomeService(CreateInMemoryHomeContentRepository());

    const result = await service.getHomePageData(
      createActor({
        id: "user-staff",
        email: "staff@app.test",
        displayName: "Sam Staff",
        role: "staff",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventSummary).toContain("2 total events");
      expect(result.value.recentEvents.map((event) => event.id)).toEqual(
        expect.arrayContaining(["event-1", "event-2"]),
      );
    }
  });

  it("shows draft events to admins", async () => {
    const service = CreateHomeService(CreateInMemoryHomeContentRepository());

    const result = await service.getHomePageData(
      createActor({
        id: "user-admin",
        email: "admin@app.test",
        displayName: "Avery Admin",
        role: "admin",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventSummary).toContain("2 total events");
      expect(result.value.recentEvents.map((event) => event.id)).toEqual(
        expect.arrayContaining(["event-1", "event-2"]),
      );
    }
  });
});
