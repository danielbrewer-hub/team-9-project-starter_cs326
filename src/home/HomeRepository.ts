import type { Result } from "../lib/result";

export type EventStatus = "draft" | "published" | "cancelled" | "past";
export type RsvpStatus = "going" | "waitlisted" | "cancelled";

export const DEMO_PUBLISHED_EVENT_ID = "event-1";
export const DEMO_DRAFT_EVENT_ID = "event-2";
export const DEMO_PUBLISHED_EVENT_ORGANIZER_ID = "user-admin";
export const DEMO_DRAFT_EVENT_ORGANIZER_ID = "user-staff";

export interface IEventRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  status: EventStatus;
  capacity?: number;
  startDatetime: string;
  endDatetime: string;
  organizerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IRsvpRecord {
  id: string;
  eventId: string;
  userId: string;
  status: RsvpStatus;
  createdAt: string;
}

export interface ICreateEventInput {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  status: EventStatus;
  capacity?: number;
  startDatetime: string;
  endDatetime: string;
  organizerId: string;
}

export interface ICreateRsvpInput {
  id: string;
  eventId: string;
  userId: string;
  status: RsvpStatus;
}

export interface IUpdateEventInput {
  title?: string;
  description?: string;
  location?: string;
  category?: string;
  status?: EventStatus;
  capacity?: number;
  startDatetime?: string;
  endDatetime?: string;
}

export interface IHomeContentRepository {
  listEvents(): Promise<Result<IEventRecord[], Error>>;
  findEventById(eventId: string): Promise<Result<IEventRecord | null, Error>>;
  createEvent(input: ICreateEventInput): Promise<Result<IEventRecord, Error>>;
  updateEvent(
    eventId: string,
    input: IUpdateEventInput,
  ): Promise<Result<IEventRecord | null, Error>>;
  updateEventStatus(
    eventId:string,
    newStatus:EventStatus
  ):Promise<Result<IEventRecord,Error>>;
  listRsvpsForEvent(eventId: string): Promise<Result<IRsvpRecord[], Error>>;
  countGoingRsvpsForEvent(eventId: string): Promise<Result<number, Error>>;
  listRsvpsForUser(userId: string): Promise<Result<IRsvpRecord[], Error>>;
  upsertRsvp(input: ICreateRsvpInput): Promise<Result<IRsvpRecord, Error>>;
}
