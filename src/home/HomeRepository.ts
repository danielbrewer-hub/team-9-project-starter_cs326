import type { Result } from "../lib/result";

export type EventStatus = "draft" | "published" | "cancelled" | "past";
export type RsvpStatus = "going" | "waitlisted" | "cancelled";

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
  listRsvpsForEvent(eventId: string): Promise<Result<IRsvpRecord[], Error>>;
  listRsvpsForUser(userId: string): Promise<Result<IRsvpRecord[], Error>>;
  upsertRsvp(input: ICreateRsvpInput): Promise<Result<IRsvpRecord, Error>>;
  cancelRsvpWithWaitlistPromotion(
    rsvpId: string,
  ): Promise<Result<{ cancelled: IRsvpRecord; promoted: IRsvpRecord | null }, Error>>;
}
