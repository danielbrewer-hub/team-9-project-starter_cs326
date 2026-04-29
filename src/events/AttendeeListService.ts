import { Err, Ok, type Result } from "../lib/result";
import type { IHomeContentRepository } from "../home/HomeRepository";
import { canViewEvent } from "./EventVisibility";
import type { IActingUser } from "./EventTypes";
import {
  EventAuthorizationError,
  EventNotFoundError,
  UnexpectedDependencyError,
} from "./errors";

export interface IAttendeeListEntry {
  displayName: string;
  createdAt: string;
}

export interface IGroupedAttendeeList {
  attending: IAttendeeListEntry[];
  waitlisted: IAttendeeListEntry[];
  cancelled: IAttendeeListEntry[];
}

export type AttendeeListError =
  | ReturnType<typeof EventNotFoundError>
  | ReturnType<typeof EventAuthorizationError>
  | ReturnType<typeof UnexpectedDependencyError>;

export interface IAttendeeListService {
  getAttendeeList(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IGroupedAttendeeList, AttendeeListError>>;
}

function normalizeEventId(eventId: string): string | null {
  const trimmed = eventId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function groupRows(rows: { displayName: string; status: string; createdAt: string }[]): IGroupedAttendeeList {
  const attending: IAttendeeListEntry[] = [];
  const waitlisted: IAttendeeListEntry[] = [];
  const cancelled: IAttendeeListEntry[] = [];

  for (const row of rows) {
    const entry: IAttendeeListEntry = {
      displayName: row.displayName,
      createdAt: row.createdAt,
    };
    if (row.status === "going") {
      attending.push(entry);
    } else if (row.status === "waitlisted") {
      waitlisted.push(entry);
    } else if (row.status === "cancelled") {
      cancelled.push(entry);
    }
  }

  return { attending, waitlisted, cancelled };
}

function canViewAttendeeList(eventOrganizerId: string, actor: IActingUser): boolean {
  return actor.role === "admin" || eventOrganizerId === actor.userId;
}

class AttendeeListService implements IAttendeeListService {
  constructor(private readonly contentRepository: IHomeContentRepository) {}

  async getAttendeeList(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IGroupedAttendeeList, AttendeeListError>> {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      return Err(EventNotFoundError("Event not found."));
    }

    const eventResult = await this.contentRepository.findEventById(normalizedEventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    const event = eventResult.value;
    if (!event || !canViewEvent(event, actor.userId, actor.role)) {
      return Err(EventNotFoundError("Event not found."));
    }

    if (!canViewAttendeeList(event.organizerId, actor)) {
      return Err(
        EventAuthorizationError(
          "Only the event organizer or an admin may view the attendee list.",
        ),
      );
    }

    const rowsResult = await this.contentRepository.listRsvpsWithAttendeeDetailsForEvent(event.id);
    if (rowsResult.ok === false) {
      return Err(UnexpectedDependencyError(rowsResult.value.message));
    }

    return Ok(groupRows(rowsResult.value));
  }
}

export function CreateAttendeeListService(
  contentRepository: IHomeContentRepository,
): IAttendeeListService {
  return new AttendeeListService(contentRepository);
}
