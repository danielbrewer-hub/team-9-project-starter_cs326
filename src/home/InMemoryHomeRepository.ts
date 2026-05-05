import { Ok, type Result } from "../lib/result";
import type {
  ICreateEventInput,
  ICreateRsvpInput,
  IEventRecord,
  IHomeContentRepository,
  IRsvpRecord,
  IUpdateEventInput,
} from "./HomeRepository";
import {
  DEMO_DRAFT_EVENT_ID as draftEventId,
  DEMO_DRAFT_EVENT_ORGANIZER_ID as draftOrganizerId,
  DEMO_PUBLISHED_EVENT_ID as publishedEventId,
  DEMO_PUBLISHED_EVENT_ORGANIZER_ID as publishedOrganizerId,
} from "./HomeRepository";

const events = new Map<string, IEventRecord>();
const rsvps = new Map<string, IRsvpRecord>();

function cloneEvent(event: IEventRecord): IEventRecord {
  return { ...event };
}

function cloneRsvp(rsvp: IRsvpRecord): IRsvpRecord {
  return { ...rsvp };
}

function listStoredEvents(): IEventRecord[] {
  return Array.from(events.values()).map(cloneEvent);
}

function findStoredEventById(eventId: string): IEventRecord | null {
  const event = events.get(eventId);
  return event ? cloneEvent(event) : null;
}

function createStoredEvent(input: ICreateEventInput, now: Date = new Date()): IEventRecord {
  const timestamp = now.toISOString();
  const event: IEventRecord = {
    ...input,
    capacity: input.capacity,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  events.set(event.id, event);
  return cloneEvent(event);
}

function updateStoredEvent(
  eventId: string,
  input: IUpdateEventInput,
  now: Date = new Date(),
): IEventRecord | null {
  const existing = events.get(eventId);
  if (!existing) {
    return null;
  }

  const next: IEventRecord = {
    ...existing,
    ...input,
    updatedAt: now.toISOString(),
  };
  events.set(eventId, next);
  return cloneEvent(next);
}

function listStoredRsvpsForEvent(eventId: string): IRsvpRecord[] {
  return Array.from(rsvps.values())
    .filter((rsvp) => rsvp.eventId === eventId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(cloneRsvp);
}

function listStoredRsvpsForUser(userId: string): IRsvpRecord[] {
  return Array.from(rsvps.values())
    .filter((rsvp) => rsvp.userId === userId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(cloneRsvp);
}

function countStoredGoingRsvpsForEvent(eventId: string): number {
  return Array.from(rsvps.values()).filter(
    (rsvp) => rsvp.eventId === eventId && rsvp.status === "going",
  ).length;
}

function upsertStoredRsvp(input: ICreateRsvpInput, now: Date = new Date()): IRsvpRecord {
  const existing = Array.from(rsvps.values()).find(
    (rsvp) => rsvp.eventId === input.eventId && rsvp.userId === input.userId,
  );

  if (existing) {
    const updated: IRsvpRecord = {
      ...existing,
      status: input.status,
    };
    rsvps.set(updated.id, updated);
    return cloneRsvp(updated);
  }

  const created: IRsvpRecord = {
    ...input,
    createdAt: now.toISOString(),
  };
  rsvps.set(created.id, created);
  return cloneRsvp(created);
}

function daysFrom(base: Date, days: number, hour: number, minute = 0): string {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function seedRepository(): void {
  if (events.size > 0) {
    return;
  }

  const seededAt = new Date();

  createStoredEvent({
    id: publishedEventId,
    title: "Sprint Planning Workshop",
    description: "Plan work for the next sprint and confirm ownership across the team.",
    location: "CS Building Room 204",
    category: "planning",
    status: "published",
    capacity: 12,
    startDatetime: "2026-04-18T14:00:00.000Z",
    endDatetime: "2026-04-18T15:30:00.000Z",
    organizerId: publishedOrganizerId,
  });

  createStoredEvent({
    id: draftEventId,
    title: "Project Demo Dry Run",
    description: "Run through the demo script and capture issues before presentation day.",
    location: "Online",
    category: "demo",
    status: "draft",
    startDatetime: daysFrom(seededAt, 7, 18),
    endDatetime: daysFrom(seededAt, 7, 19),
    organizerId: draftOrganizerId,
  });

  upsertStoredRsvp({
    id: "rsvp-1",
    eventId: publishedEventId,
    userId: "user-admin",
    status: "going",
  });

  upsertStoredRsvp({
    id: "rsvp-2",
    eventId: publishedEventId,
    userId: "user-staff",
    status: "waitlisted",
  });
}

class InMemoryHomeContentRepository implements IHomeContentRepository {
  constructor() {
    seedRepository();
  }

  async listEvents(): Promise<Result<IEventRecord[], Error>> {
    return Ok(listStoredEvents());
  }

  async findEventById(eventId: string): Promise<Result<IEventRecord | null, Error>> {
    const event = findStoredEventById(eventId)
    if(!event){
      return {ok:false,value:new Error("Event not found.")};
    }
    return Ok(event);
  }

  async createEvent(input: ICreateEventInput): Promise<Result<IEventRecord, Error>> {
    return Ok(createStoredEvent(input));
  }

  async updateEvent(
    eventId: string,
    input: IUpdateEventInput,
  ): Promise<Result<IEventRecord | null, Error>> {
    return Ok(updateStoredEvent(eventId, input));
  }

  async listRsvpsForEvent(eventId: string): Promise<Result<IRsvpRecord[], Error>> {
    return Ok(listStoredRsvpsForEvent(eventId));
  }

  async countGoingRsvpsForEvent(eventId: string): Promise<Result<number, Error>> {
    return Ok(countStoredGoingRsvpsForEvent(eventId));
  }

  async listRsvpsForUser(userId: string): Promise<Result<IRsvpRecord[], Error>> {
    return Ok(listStoredRsvpsForUser(userId));
  }

  async upsertRsvp(input: ICreateRsvpInput): Promise<Result<IRsvpRecord, Error>> {
    return Ok(upsertStoredRsvp(input));
  }
}

export function CreateInMemoryHomeContentRepository(): IHomeContentRepository {
  return new InMemoryHomeContentRepository();
}

export {
  countStoredGoingRsvpsForEvent,
  createStoredEvent,
  findStoredEventById,
  listStoredEvents,
  listStoredRsvpsForEvent,
  listStoredRsvpsForUser,
  upsertStoredRsvp,
  updateStoredEvent,
};
