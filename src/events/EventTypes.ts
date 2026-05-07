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
  waitlistPosition?: number | null;
  isRsvpPending?: boolean;
  isFull?: boolean;
  canViewAttendees?: boolean;
}

export interface IAttendeeListEntryView {
  userId: string;
  displayName: string;
  status: RsvpStatus;
  createdAt: string;
}

export interface IAttendeeListView {
  eventId: string;
  eventTitle: string;
  attending: IAttendeeListEntryView[];
  waitlisted: IAttendeeListEntryView[];
  cancelled: IAttendeeListEntryView[];
}
