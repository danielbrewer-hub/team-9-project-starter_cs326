import type { IUserRepository } from "../auth/UserRepository";
import { Err, Ok, type Result } from "../lib/result";
import type { IHomeContentRepository, RsvpStatus } from "../home/HomeRepository";
import {
  EventAuthorizationError,
  EventNotFoundError,
  UnexpectedDependencyError,
} from "./errors";
import type {
  EventAuthorizationError as EventAuthorizationErrorT,
  EventNotFoundError as EventNotFoundErrorT,
  EventUnexpectedDependencyError,
} from "./errors";
import type { IActingUser } from "./EventTypes";
import { canManageEvent } from "./EventVisibility";

export interface IAttendeeListEntry {
  displayName: string;
  /** ISO timestamp from the RSVP record (`createdAt`). */
  rsvpedAt: string;
}

export interface IEventAttendeeListData {
  attending: IAttendeeListEntry[];
  waitlisted: IAttendeeListEntry[];
  cancelled: IAttendeeListEntry[];
}

export type EventAttendeeListError =
  | EventNotFoundErrorT
  | EventAuthorizationErrorT
  | EventUnexpectedDependencyError;

function normalizeEventId(eventId: string): string | null {
  const trimmed = eventId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bucketForStatus(status: RsvpStatus): keyof IEventAttendeeListData | null {
  if (status === "going") {
    return "attending";
  }
  if (status === "waitlisted") {
    return "waitlisted";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return null;
}

function compareByRsvpedAt(a: IAttendeeListEntry, b: IAttendeeListEntry): number {
  return a.rsvpedAt.localeCompare(b.rsvpedAt);
}

export interface IEventAttendeeListService {
  getAttendeeList(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventAttendeeListData, EventAttendeeListError>>;
}

class EventAttendeeListService implements IEventAttendeeListService {
  constructor(
    private readonly contentRepository: IHomeContentRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async getAttendeeList(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventAttendeeListData, EventAttendeeListError>> {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      return Err(EventNotFoundError("Event not found."));
    }

    const eventResult = await this.contentRepository.findEventById(normalizedEventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    const event = eventResult.value;
    if (!event) {
      return Err(EventNotFoundError("Event not found."));
    }

    if (!canManageEvent(event, actor.userId, actor.role)) {
      return Err(EventAuthorizationError("Only the event organizer or an admin may view the attendee list."));
    }

    const rsvpsResult = await this.contentRepository.listRsvpsForEvent(event.id);
    if (rsvpsResult.ok === false) {
      return Err(UnexpectedDependencyError(rsvpsResult.value.message));
    }

    const attending: IAttendeeListEntry[] = [];
    const waitlisted: IAttendeeListEntry[] = [];
    const cancelled: IAttendeeListEntry[] = [];

    for (const rsvp of rsvpsResult.value) {
      const bucketKey = bucketForStatus(rsvp.status);
      if (!bucketKey) {
        continue;
      }

      const userResult = await this.userRepository.findById(rsvp.userId);
      if (userResult.ok === false) {
        return Err(UnexpectedDependencyError(userResult.value.message));
      }
      const user = userResult.value;
      if (!user) {
        return Err(UnexpectedDependencyError("Unable to resolve an attendee profile."));
      }

      const row: IAttendeeListEntry = {
        displayName: user.displayName,
        rsvpedAt: rsvp.createdAt,
      };

      if (bucketKey === "attending") {
        attending.push(row);
      } else if (bucketKey === "waitlisted") {
        waitlisted.push(row);
      } else {
        cancelled.push(row);
      }
    }

    attending.sort(compareByRsvpedAt);
    waitlisted.sort(compareByRsvpedAt);
    cancelled.sort(compareByRsvpedAt);

    return Ok({ attending, waitlisted, cancelled });
  }
}

export function CreateEventAttendeeListService(
  contentRepository: IHomeContentRepository,
  userRepository: IUserRepository,
): IEventAttendeeListService {
  return new EventAttendeeListService(contentRepository, userRepository);
}
