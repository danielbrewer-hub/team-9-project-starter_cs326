import type { Event, PrismaClient, Rsvp } from "@prisma/client";
import { DEMO_USERS } from "../auth/InMemoryUserRepository";
import { Err, Ok, type Result } from "../lib/result";
import type {
  IEventAttendeeRecord,
  ICreateEventInput,
  ICreateRsvpInput,
  IEventRecord,
  IHomeContentRepository,
  IRsvpRecord,
  IUpdateEventInput,
} from "./HomeRepository";
import {
  DEMO_DRAFT_EVENT_ID,
  DEMO_DRAFT_EVENT_ORGANIZER_ID,
  DEMO_PUBLISHED_EVENT_ID,
  DEMO_PUBLISHED_EVENT_ORGANIZER_ID,
} from "./HomeRepository";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toEventRecord(event: Event): IEventRecord {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    category: event.category,
    status: event.status as IEventRecord["status"],
    capacity: event.capacity ?? undefined,
    startDatetime: event.startDatetime.toISOString(),
    endDatetime: event.endDatetime.toISOString(),
    organizerId: event.organizerId,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function toRsvpRecord(rsvp: Rsvp): IRsvpRecord {
  return {
    id: rsvp.id,
    eventId: rsvp.eventId,
    userId: rsvp.userId,
    status: rsvp.status as IRsvpRecord["status"],
    createdAt: rsvp.createdAt.toISOString(),
  };
}

function toRsvpAttendeeRecord(
  rsvp: Rsvp & { user: { displayName: string } },
): IEventAttendeeRecord {
  return {
    ...toRsvpRecord(rsvp),
    displayName: rsvp.user.displayName,
  };
}

function toEventCreateData(input: ICreateEventInput) {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    location: input.location,
    category: input.category,
    status: input.status,
    capacity: input.capacity ?? null,
    startDatetime: new Date(input.startDatetime),
    endDatetime: new Date(input.endDatetime),
    organizerId: input.organizerId,
  };
}

function toEventUpdateData(input: IUpdateEventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    category: input.category,
    status: input.status,
    capacity: input.capacity,
    startDatetime: input.startDatetime ? new Date(input.startDatetime) : undefined,
    endDatetime: input.endDatetime ? new Date(input.endDatetime) : undefined,
  };
}

function daysFrom(base: Date, days: number, hour: number, minute = 0): string {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

export class PrismaHomeContentRepository implements IHomeContentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listEvents(): Promise<Result<IEventRecord[], Error>> {
    try {
      const events = await this.prisma.event.findMany();
      return Ok(events.map(toEventRecord));
    } catch (error) {
      return Err(toError(error));
    }
  }

  async findEventById(eventId: string): Promise<Result<IEventRecord | null, Error>> {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      return Ok(event ? toEventRecord(event) : null);
    } catch (error) {
      return Err(toError(error));
    }
  }

  async createEvent(input: ICreateEventInput): Promise<Result<IEventRecord, Error>> {
    try {
      const event = await this.prisma.event.create({
        data: toEventCreateData(input),
      });
      return Ok(toEventRecord(event));
    } catch (error) {
      return Err(toError(error));
    }
  }

  async updateEvent(
    eventId: string,
    input: IUpdateEventInput,
  ): Promise<Result<IEventRecord | null, Error>> {
    try {
      const existing = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!existing) {
        return Ok(null);
      }

      const event = await this.prisma.event.update({
        where: { id: eventId },
        data: toEventUpdateData(input),
      });
      return Ok(toEventRecord(event));
    } catch (error) {
      return Err(toError(error));
    }
  }

  async listRsvpsForEvent(eventId: string): Promise<Result<IRsvpRecord[], Error>> {
    try {
      const rsvps = await this.prisma.rsvp.findMany({
        where: { eventId },
        orderBy: { createdAt: "asc" },
      });
      return Ok(rsvps.map(toRsvpRecord));
    } catch (error) {
      return Err(toError(error));
    }
  }

  async listRsvpAttendeesForEvent(eventId: string): Promise<Result<IEventAttendeeRecord[], Error>> {
    try {
      const rsvps = await this.prisma.rsvp.findMany({
        where: { eventId },
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: {
              displayName: true,
            },
          },
        },
      });
      return Ok(rsvps.map(toRsvpAttendeeRecord));
    } catch (error) {
      return Err(toError(error));
    }
  }

  async countGoingRsvpsForEvent(eventId: string): Promise<Result<number, Error>> {
    try {
      const count = await this.prisma.rsvp.count({
        where: { eventId, status: "going" },
      });
      return Ok(count);
    } catch (error) {
      return Err(toError(error));
    }
  }

  async listRsvpsForUser(userId: string): Promise<Result<IRsvpRecord[], Error>> {
    try {
      const rsvps = await this.prisma.rsvp.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      return Ok(rsvps.map(toRsvpRecord));
    } catch (error) {
      return Err(toError(error));
    }
  }

  async upsertRsvp(input: ICreateRsvpInput): Promise<Result<IRsvpRecord, Error>> {
    try {
      const rsvp = await this.prisma.rsvp.upsert({
        where: {
          eventId_userId: {
            eventId: input.eventId,
            userId: input.userId,
          },
        },
        update: { status: input.status },
        create: {
          id: input.id,
          eventId: input.eventId,
          userId: input.userId,
          status: input.status,
        },
      });

      return Ok(toRsvpRecord(rsvp));
    } catch (error) {
      return Err(toError(error));
    }
  }
}

export function CreatePrismaHomeContentRepository(
  prisma: PrismaClient,
): IHomeContentRepository {
  return new PrismaHomeContentRepository(prisma);
}

export async function seedPrismaHomeContentRepository(prisma: PrismaClient): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    await prisma.user.createMany({
      data: DEMO_USERS.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        passwordHash: user.passwordHash,
      })),
    });
  }

  const eventCount = await prisma.event.count();
  if (eventCount > 0) {
    return;
  }

  const seededAt = new Date();
  const repository = CreatePrismaHomeContentRepository(prisma);

  const publishedEvent = await repository.createEvent({
    id: DEMO_PUBLISHED_EVENT_ID,
    title: "Sprint Planning Workshop",
    description: "Plan work for the next sprint and confirm ownership across the team.",
    location: "CS Building Room 204",
    category: "planning",
    status: "published",
    capacity: 12,
    startDatetime: "2026-04-18T14:00:00.000Z",
    endDatetime: "2026-04-18T15:30:00.000Z",
    organizerId: DEMO_PUBLISHED_EVENT_ORGANIZER_ID,
  });
  if (!publishedEvent.ok) {
    throw publishedEvent.value;
  }

  const draftEvent = await repository.createEvent({
    id: DEMO_DRAFT_EVENT_ID,
    title: "Project Demo Dry Run",
    description: "Run through the demo script and capture issues before presentation day.",
    location: "Online",
    category: "demo",
    status: "draft",
    startDatetime: daysFrom(seededAt, 7, 18),
    endDatetime: daysFrom(seededAt, 7, 19),
    organizerId: DEMO_DRAFT_EVENT_ORGANIZER_ID,
  });
  if (!draftEvent.ok) {
    throw draftEvent.value;
  }

  const goingRsvp = await repository.upsertRsvp({
    id: "rsvp-1",
    eventId: DEMO_PUBLISHED_EVENT_ID,
    userId: "user-admin",
    status: "going",
  });
  if (!goingRsvp.ok) {
    throw goingRsvp.value;
  }

  const waitlistedRsvp = await repository.upsertRsvp({
    id: "rsvp-2",
    eventId: DEMO_PUBLISHED_EVENT_ID,
    userId: "user-staff",
    status: "waitlisted",
  });
  if (!waitlistedRsvp.ok) {
    throw waitlistedRsvp.value;
  }
}
