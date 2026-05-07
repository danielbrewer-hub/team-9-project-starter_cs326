import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { CreateInMemoryHomeContentRepository } from "../../src/home/InMemoryHomeRepository";
import {
  DEMO_DRAFT_EVENT_ID,
  DEMO_PUBLISHED_EVENT_ID,
  type ICreateEventInput,
  type IHomeContentRepository,
} from "../../src/home/HomeRepository";
import {
  CreatePrismaHomeContentRepository,
  seedPrismaHomeContentRepository,
} from "../../src/home/PrismaHomeRepository";
import type { Result } from "../../src/lib/result";

type RepositoryContractSetup =
  | IHomeContentRepository
  | {
      repository: IHomeContentRepository;
      cleanup?: () => Promise<void>;
    };

function unwrapOk<T>(result: Result<T, Error>): T {
  if (!result.ok) {
    throw result.value;
  }

  return result.value;
}

function uniqueId(label: string): string {
  return `repo-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function futureTestEventWindow(): Pick<ICreateEventInput, "startDatetime" | "endDatetime"> {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(14, 0, 0, 0);

  const end = new Date(start);
  end.setHours(start.getHours() + 1);

  return {
    startDatetime: start.toISOString(),
    endDatetime: end.toISOString(),
  };
}

function createEventInput(overrides: Partial<ICreateEventInput> = {}): ICreateEventInput {
  const id = uniqueId("event");
  return {
    id,
    title: "Repository Layer Test Event",
    description: "Exercises in-memory event persistence.",
    location: "CS Building Room 204",
    category: "testing",
    status: "published",
    capacity: 3,
    ...futureTestEventWindow(),
    organizerId: "user-staff",
    ...overrides,
  };
}

function describeHomeRepositoryContract(
  implementationName: string,
  createRepository: () => RepositoryContractSetup | Promise<RepositoryContractSetup>,
): void {
  describe(implementationName, () => {
    let repository: IHomeContentRepository;
    let cleanup: (() => Promise<void>) | undefined;

    beforeEach(async () => {
      const setup = await createRepository();
      if ("repository" in setup) {
        repository = setup.repository;
        cleanup = setup.cleanup;
        return;
      }

      repository = setup;
      cleanup = undefined;
    });

    afterEach(async () => {
      await cleanup?.();
    });

    it("seeds the demo events and initial RSVP records", async () => {
      const publishedEvent = unwrapOk(await repository.findEventById(DEMO_PUBLISHED_EVENT_ID));
      const draftEvent = unwrapOk(await repository.findEventById(DEMO_DRAFT_EVENT_ID));
      const publishedRsvps = unwrapOk(await repository.listRsvpsForEvent(DEMO_PUBLISHED_EVENT_ID));
      const goingCount = unwrapOk(await repository.countGoingRsvpsForEvent(DEMO_PUBLISHED_EVENT_ID));

      expect(publishedEvent).toMatchObject({
        id: DEMO_PUBLISHED_EVENT_ID,
        title: "Sprint Planning Workshop",
        status: "published",
      });
      expect(draftEvent).toMatchObject({
        id: DEMO_DRAFT_EVENT_ID,
        title: "Project Demo Dry Run",
        status: "draft",
      });
      expect(publishedRsvps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "rsvp-1", status: "going" }),
          expect.objectContaining({ id: "rsvp-2", status: "waitlisted" }),
        ]),
      );
      expect(goingCount).toBe(1);
    });

    it("creates events with timestamps and returns cloned records", async () => {
      const input = createEventInput();

      const created = unwrapOk(await repository.createEvent(input));
      created.title = "Mutated outside the repository";

      const found = unwrapOk(await repository.findEventById(input.id));
      const listed = unwrapOk(await repository.listEvents()).find((event) => event.id === input.id);
      if (!listed) {
        throw new Error("Created event was not returned by listEvents.");
      }
      listed.location = "Mutated list result";

      const foundAgain = unwrapOk(await repository.findEventById(input.id));

      expect(found).toMatchObject({
        ...input,
        title: "Repository Layer Test Event",
      });
      expect(Date.parse(found?.createdAt ?? "")).not.toBeNaN();
      expect(found?.createdAt).toBe(found?.updatedAt);
      expect(foundAgain?.location).toBe(input.location);
    });

    it("updates existing events while preserving unchanged fields", async () => {
      const input = createEventInput({ capacity: 8 });
      const created = unwrapOk(await repository.createEvent(input));

      const updated = unwrapOk(
        await repository.updateEvent(input.id, {
          title: "Updated Repository Event",
          capacity: 12,
          status: "cancelled",
        }),
      );

      expect(updated).toMatchObject({
        id: input.id,
        title: "Updated Repository Event",
        description: input.description,
        location: input.location,
        capacity: 12,
        status: "cancelled",
        createdAt: created.createdAt,
      });
      expect(Date.parse(updated?.updatedAt ?? "")).not.toBeNaN();
    });

    it("returns null when updating or finding a missing event", async () => {
      const missingId = uniqueId("missing-event");

      const found = unwrapOk(await repository.findEventById(missingId));
      const updated = unwrapOk(await repository.updateEvent(missingId, { title: "Nope" }));

      expect(found).toBeNull();
      expect(updated).toBeNull();
    });

    it("filters RSVP records by event and user and counts only going RSVPs", async () => {
      const eventId = uniqueId("rsvp-event");
      const otherEventId = uniqueId("other-rsvp-event");
      const userId = "user-reader";
      const otherUserId = "user-staff";

      unwrapOk(await repository.createEvent(createEventInput({ id: eventId })));
      unwrapOk(await repository.createEvent(createEventInput({ id: otherEventId })));

      const going = unwrapOk(
        await repository.upsertRsvp({
          id: uniqueId("rsvp"),
          eventId,
          userId,
          status: "going",
        }),
      );
      const waitlisted = unwrapOk(
        await repository.upsertRsvp({
          id: uniqueId("rsvp"),
          eventId,
          userId: otherUserId,
          status: "waitlisted",
        }),
      );
      unwrapOk(
        await repository.upsertRsvp({
          id: uniqueId("rsvp"),
          eventId: otherEventId,
          userId,
          status: "going",
        }),
      );
      const cancelled = unwrapOk(
        await repository.upsertRsvp({
          id: uniqueId("rsvp"),
          eventId,
          userId: "user-admin",
          status: "cancelled",
        }),
      );

      const eventRsvps = unwrapOk(await repository.listRsvpsForEvent(eventId));
      const attendeeRows = unwrapOk(await repository.listRsvpAttendeesForEvent(eventId));
      const userRsvps = unwrapOk(await repository.listRsvpsForUser(userId));
      const goingCount = unwrapOk(await repository.countGoingRsvpsForEvent(eventId));

      expect(eventRsvps).toHaveLength(3);
      expect(eventRsvps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: going.id, eventId, status: "going" }),
          expect.objectContaining({ id: waitlisted.id, eventId, status: "waitlisted" }),
          expect.objectContaining({ id: cancelled.id, eventId, status: "cancelled" }),
        ]),
      );
      expect(userRsvps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventId, userId, status: "going" }),
          expect.objectContaining({ eventId: otherEventId, userId, status: "going" }),
        ]),
      );
      expect(userRsvps).toHaveLength(2);
      expect(goingCount).toBe(1);
      expect(attendeeRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventId,
            userId,
            status: "going",
            displayName: expect.any(String),
          }),
          expect.objectContaining({
            eventId,
            userId: otherUserId,
            status: "waitlisted",
            displayName: expect.any(String),
          }),
          expect.objectContaining({
            eventId,
            userId: "user-admin",
            status: "cancelled",
            displayName: expect.any(String),
          }),
        ]),
      );
      expect(attendeeRows).toHaveLength(3);
    });

    it("upserts RSVPs by event and user while preserving the original record identity", async () => {
      const eventId = uniqueId("upsert-event");
      const userId = "user-admin";

      unwrapOk(await repository.createEvent(createEventInput({ id: eventId })));

      const created = unwrapOk(
        await repository.upsertRsvp({
          id: uniqueId("rsvp-original"),
          eventId,
          userId,
          status: "going",
        }),
      );
      const updated = unwrapOk(
        await repository.upsertRsvp({
          id: uniqueId("rsvp-replacement"),
          eventId,
          userId,
          status: "cancelled",
        }),
      );

      const eventRsvps = unwrapOk(await repository.listRsvpsForEvent(eventId));

      expect(updated).toMatchObject({
        id: created.id,
        eventId,
        userId,
        status: "cancelled",
        createdAt: created.createdAt,
      });
      expect(eventRsvps).toHaveLength(1);
      expect(eventRsvps[0]).toMatchObject(updated);
    });

    it("returns cloned RSVP records from reads and writes", async () => {
      const eventId = uniqueId("clone-rsvp-event");
      const userId = "user-admin";

      unwrapOk(await repository.createEvent(createEventInput({ id: eventId })));

      const created = unwrapOk(
        await repository.upsertRsvp({
          id: uniqueId("rsvp"),
          eventId,
          userId,
          status: "going",
        }),
      );
      created.status = "cancelled";

      const listed = unwrapOk(await repository.listRsvpsForEvent(eventId));
      listed[0].status = "waitlisted";

      const listedAgain = unwrapOk(await repository.listRsvpsForEvent(eventId));

      expect(listedAgain).toHaveLength(1);
      expect(listedAgain[0]).toMatchObject({
        eventId,
        userId,
        status: "going",
      });
    });
  });
}

describeHomeRepositoryContract("InMemoryHomeRepository", () => CreateInMemoryHomeContentRepository());

async function createPrismaSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL UNIQUE,
      "displayName" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Event" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "location" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "capacity" INTEGER,
      "startDatetime" DATETIME NOT NULL,
      "endDatetime" DATETIME NOT NULL,
      "organizerId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId")
        REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Rsvp" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "eventId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Rsvp_eventId_fkey" FOREIGN KEY ("eventId")
        REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Rsvp_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX "Rsvp_eventId_userId_key" ON "Rsvp" ("eventId", "userId")
  `);
}

async function createPrismaContractRepository(): Promise<RepositoryContractSetup> {
  const adapter = new PrismaBetterSqlite3({ url: ":memory:" });
  const prisma = new PrismaClient({ adapter });

  await createPrismaSchema(prisma);
  await seedPrismaHomeContentRepository(prisma);

  return {
    repository: CreatePrismaHomeContentRepository(prisma),
    cleanup: async () => {
      await prisma.$disconnect();
    },
  };
}

describeHomeRepositoryContract("PrismaHomeRepository", createPrismaContractRepository);
