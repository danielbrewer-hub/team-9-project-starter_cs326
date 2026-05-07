import type { UserRole } from "../auth/User";
import type { IEventRecord, RsvpStatus } from "../home/HomeRepository";

export interface IActingUser {
  userId: string;
  role: UserRole;
}

export interface ICreateEventInput {
  title: string;
  description: string;
  location: string;
  category: string;
  capacity?: string;
  startDatetime: string;
  endDatetime: string;
}

export interface IEventDetailView extends IEventRecord {
  organizerDisplayName: string;
  attendeeCount: number;
  canEdit: boolean;
  canCancel: boolean;
  canRsvp: boolean;
  rsvpStatus?: RsvpStatus | null;
  isRsvpPending?: boolean;
  isFull?: boolean;
}

export type AttendeeListStatus = "going" | "waitlisted" | "cancelled";

export interface IEventAttendeeEntry {
  userId: string;
  displayName: string;
  status: AttendeeListStatus;
  rsvpCreatedAt: string;
}

export interface IEventAttendeeListView {
  eventId: string;
  attendees: Record<AttendeeListStatus, IEventAttendeeEntry[]>;
}
