import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import {
  DEMO_PUBLISHED_EVENT_ID,
  type ICreateEventInput,
  type IHomeContentRepository,
} from "../../src/home/HomeRepository";
import {
  CreatePrismaHomeContentRepository,
  seedPrismaHomeContentRepository,
} from "../../src/home/PrismaHomeRepository";
import type { Result } from "../../src/lib/result";
import {
  createEventAppHarness,
  signInAs,
} from "../support/eventAppHarness";

type PrismaAppHarness = {
  app: Express;
  prisma: PrismaClient;
  repository: IHomeContentRepository;
};

const validEventForm = {
  title: "Prisma Draft Planning",
  description: "Create a draft event through the Prisma repository.",
  location: "CS Building Room 204",
  category: "planning",
  capacity: "16",
  startDatetime: "2026-05-05T14:00",
  endDatetime: "2026-05-05T15:30",
};

function unwrapOk<T>(result: Result<T, Error>): T {
  if (!result.ok) {
    throw result.value;
  }

  return result.value;
}

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
      "updatedAt" DATETIME NOT NULL,
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

async function createHarness(): Promise<PrismaAppHarness> {
  const adapter = new PrismaBetterSqlite3({ url: ":memory:" });
  const prisma = new PrismaClient({ adapter });

  await createPrismaSchema(prisma);
  await seedPrismaHomeContentRepository(prisma);

  const repository = CreatePrismaHomeContentRepository(prisma);
  const { app } = createEventAppHarness({ contentRepository: repository });

  return { app, prisma, repository };
}

async function createStoredDraft(
  repository: IHomeContentRepository,
  overrides: Partial<ICreateEventInput> = {},
): Promise<string> {
  const input: ICreateEventInput = {
    id: `prisma-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "Past Start Draft",
    description: "A draft whose start time has already passed.",
    location: "Online",
    category: "planning",
    status: "draft",
    capacity: 8,
    startDatetime: "2020-01-01T14:00:00.000Z",
    endDatetime: "2020-01-01T15:00:00.000Z",
    organizerId: "user-staff",
    ...overrides,
  };

  const created = unwrapOk(await repository.createEvent(input));
  return created.id;
}

describe("Prisma-backed Feature 1 and Feature 2 app flow", () => {
  let harness: PrismaAppHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.prisma.$disconnect();
  });

  it.each([
    ["staff", "user-staff"],
    ["admin", "user-admin"],
  ] as const)("creates a persisted draft event for %s users", async (role, organizerId) => {
    const agent = await signInAs(harness.app, role);

    const createResponse = await agent
      .post("/events")
      .type("form")
      .send(validEventForm)
      .expect(302);

    const eventId = createResponse.headers.location.replace("/events/", "");
    const stored = unwrapOk(await harness.repository.findEventById(eventId));

    expect(stored).toMatchObject({
      title: "Prisma Draft Planning",
      status: "draft",
      organizerId,
      capacity: 16,
    });

    const detailResponse = await agent.get(`/events/${eventId}`).expect(200);
    expect(detailResponse.text).toContain("Prisma Draft Planning");
    expect(detailResponse.text).toContain("draft");
  });

  it("blocks members from accessing or submitting event creation with Prisma storage", async () => {
    const agent = await signInAs(harness.app, "user");

    await agent.get("/events/new").expect(403);

    const response = await agent
      .post("/events")
      .type("form")
      .send(validEventForm)
      .expect(403);

    expect(response.text).toContain("Only organizers and admins can create events.");
  });

  it("keeps created draft details visible to the owner and admins only", async () => {
    const staff = await signInAs(harness.app, "staff");
    const createResponse = await staff
      .post("/events")
      .type("form")
      .send(validEventForm)
      .expect(302);
    const eventId = createResponse.headers.location.replace("/events/", "");

    await staff.get(`/events/${eventId}`).expect(200);

    const admin = await signInAs(harness.app, "admin");
    const adminResponse = await admin.get(`/events/${eventId}`).expect(200);
    expect(adminResponse.text).toContain("Prisma Draft Planning");

    const member = await signInAs(harness.app, "user");
    const memberResponse = await member.get(`/events/${eventId}`).expect(404);
    expect(memberResponse.text).toContain("Event not found.");
    expect(memberResponse.text).not.toContain("Prisma Draft Planning");
  });

  it("renders published Prisma event details with organizer and attendance data", async () => {
    const member = await signInAs(harness.app, "user");

    const response = await member.get(`/events/${DEMO_PUBLISHED_EVENT_ID}`).expect(200);

    expect(response.text).toContain("Sprint Planning Workshop");
    expect(response.text).toContain("Avery Admin");
    expect(response.text).toContain("1 / 12 attending");
  });

  it("shows already-started Prisma drafts to owner and admins but not members", async () => {
    const eventId = await createStoredDraft(harness.repository);

    const staff = await signInAs(harness.app, "staff");
    const staffResponse = await staff.get(`/events/${eventId}`).expect(200);
    expect(staffResponse.text).toContain("Past Start Draft");
    expect(staffResponse.text).toContain("draft");

    const admin = await signInAs(harness.app, "admin");
    const adminResponse = await admin.get(`/events/${eventId}`).expect(200);
    expect(adminResponse.text).toContain("Past Start Draft");

    const member = await signInAs(harness.app, "user");
    const memberResponse = await member.get(`/events/${eventId}`).expect(404);
    expect(memberResponse.text).toContain("Event not found.");
    expect(memberResponse.text).not.toContain("Past Start Draft");
  });
});
