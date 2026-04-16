import { Err, Ok, type Result } from "../lib/result";
import type { IAuthenticatedUser } from "../auth/User";
import type {
  ICreateRsvpInput,
  IEventRecord,
  IRsvpRecord,
  IHomeContentRepository,
} from "./HomeRepository";

export interface IRsvpDashboardItem {
  id: string;
  title: string;
  category: string;
  location: string;
  dateLabel: string;
  timeLabel: string;
  rsvpStatus: string;
  eventStatus: string;
}

export interface IRsvpDashboardData {
  upcomingRsvps: IRsvpDashboardItem[];
  pastRsvps: IRsvpDashboardItem[];
}

export type RsvpDashboardError = {
  name: "ValidationError" | "UnexpectedDependencyError";
  message: string;
};

function ValidationError(message: string): RsvpDashboardError {
  return { name: "ValidationError", message };
}

function UnexpectedDependencyError(message: string): RsvpDashboardError {
  return { name: "UnexpectedDependencyError", message };
}

export interface IRsvpDashboardService {
  getRsvpDashboardData(
    actor: IAuthenticatedUser,
  ): Promise<Result<IRsvpDashboardData, RsvpDashboardError>>;
  cancelRsvp(
    rsvpId: string,
    actor: IAuthenticatedUser,
  ): Promise<Result<void, RsvpDashboardError>>;
}

function formatEventDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeEventStatus(event: IEventRecord): string {
  switch (event.status) {
    case "draft":
      return "Draft";
    case "published":
      return "Published";
    case "cancelled":
      return "Cancelled";
    case "past":
      return "Past";
    default:
      return event.status;
  }
}

function toDashboardItem(rsvp: IRsvpRecord, event: IEventRecord): IRsvpDashboardItem {
  return {
    id: rsvp.id,
    title: event.title,
    category: event.category,
    location: event.location,
    dateLabel: formatEventDate(event.startDatetime),
    timeLabel: `${formatEventTime(event.startDatetime)} - ${formatEventTime(event.endDatetime)}`,
    rsvpStatus: rsvp.status,
    eventStatus: normalizeEventStatus(event),
  };
}

function isUpcomingItem(rsvp: IRsvpRecord, event: IEventRecord): boolean {
  if (rsvp.status === "cancelled") {
    return false;
  }

  return event.status !== "past" && event.status !== "cancelled";
}

class RsvpDashboardService implements IRsvpDashboardService {
  constructor(private readonly repository: IHomeContentRepository) {}

  async getRsvpDashboardData(
    actor: IAuthenticatedUser,
  ): Promise<Result<IRsvpDashboardData, RsvpDashboardError>> {
    const rsvpsResult = await this.repository.listRsvpsForUser(actor.id);
    if (rsvpsResult.ok === false) {
      return Err(UnexpectedDependencyError(rsvpsResult.value.message));
    }

    const upcomingRsvps: IRsvpDashboardItem[] = [];
    const pastRsvps: IRsvpDashboardItem[] = [];

    for (const rsvp of rsvpsResult.value) {
      const eventResult = await this.repository.findEventById(rsvp.eventId);
      if (eventResult.ok === false) {
        return Err(UnexpectedDependencyError(eventResult.value.message));
      }

      const event = eventResult.value;
      if (!event) {
        return Err(UnexpectedDependencyError("Unable to resolve event details for an RSVP."));
      }

      const item = toDashboardItem(rsvp, event);
      if (isUpcomingItem(rsvp, event)) {
        upcomingRsvps.push(item);
      } else {
        pastRsvps.push(item);
      }
    }

    return Ok({ upcomingRsvps, pastRsvps });
  }

  async cancelRsvp(
    rsvpId: string,
    actor: IAuthenticatedUser,
  ): Promise<Result<void, RsvpDashboardError>> {
    const rsvpsResult = await this.repository.listRsvpsForUser(actor.id);
    if (rsvpsResult.ok === false) {
      return Err(UnexpectedDependencyError(rsvpsResult.value.message));
    }

    const rsvp = rsvpsResult.value.find((entry) => entry.id === rsvpId);
    if (!rsvp) {
      return Err(ValidationError("RSVP not found."));
    }

    if (rsvp.status === "cancelled") {
      return Err(ValidationError("This RSVP has already been cancelled."));
    }

    const eventResult = await this.repository.findEventById(rsvp.eventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    const event = eventResult.value;
    if (!event) {
      return Err(UnexpectedDependencyError("Unable to resolve event details for the RSVP."));
    }

    if (event.status === "past" || event.status === "cancelled") {
      return Err(ValidationError("Cannot cancel an RSVP for a past or cancelled event."));
    }

    const upsertResult = await this.repository.upsertRsvp({
      id: rsvp.id,
      eventId: rsvp.eventId,
      userId: rsvp.userId,
      status: "cancelled",
    });

    if (upsertResult.ok === false) {
      return Err(UnexpectedDependencyError(upsertResult.value.message));
    }

    return Ok(undefined);
  }
}

export function CreateRsvpDashboardService(
  repository: IHomeContentRepository,
): IRsvpDashboardService {
  return new RsvpDashboardService(repository);
}
