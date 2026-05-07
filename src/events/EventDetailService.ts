import { Err, Ok, type Result } from "../lib/result";
import type { IUserRepository } from "../auth/UserRepository";
import type { IAttendeeListRecord, IEventRecord, IHomeContentRepository } from "../home/HomeRepository";
import {
  EventAuthorizationError,
  EventNotFoundError,
  UnexpectedDependencyError,
  type EventDetailError,
  type EventRsvpToggleError,
} from "./errors";
import type { IActingUser, IAttendeeListView, IEventDetailView } from "./EventTypes";
import { canManageEvent, canViewEvent } from "./EventVisibility";

type EventPermissionFlags = Pick<
  IEventDetailView,
  "canEdit" | "canCancel" | "canRsvp" | "canViewAttendees"
>;

export interface IEventDetailService {
  getEventDetail(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventDetailError>>;

  /**
   * Toggle RSVP for an event. If user is going, cancel; if not, RSVP as going or waitlist.
   */
  toggleRsvp(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventRsvpToggleError>>;
  getAttendeeList(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IAttendeeListView, EventDetailError>>;
}

function normalizeEventId(eventId: string): string | null {
  const trimmed = eventId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildEventPermissionFlags(
  event: IEventRecord,
  actor: IActingUser,
): EventPermissionFlags {
  return {
    canEdit: canManageEvent(event, actor.userId, actor.role),
    canCancel: canManageEvent(event, actor.userId, actor.role),
    canRsvp: actor.role === "user" && event.status === "published",
    canViewAttendees: actor.role === "admin" || event.organizerId === actor.userId,
  };
}

function toEventDetailView(
  event: IEventRecord,
  organizerDisplayName: string,
  attendeeCount: number,
  actor: IActingUser,
): IEventDetailView {
  return {
    ...event,
    organizerDisplayName,
    attendeeCount,
    ...buildEventPermissionFlags(event, actor),
    // These will be filled in getEventDetail
  };
}

function groupAttendees(attendees: IAttendeeListRecord[]): Omit<IAttendeeListView, "eventId" | "eventTitle"> {
  return attendees.reduce(
    (accumulator, attendee) => {
      if (attendee.status === "going") {
        accumulator.attending.push(attendee);
      } else if (attendee.status === "waitlisted") {
        accumulator.waitlisted.push(attendee);
      } else {
        accumulator.cancelled.push(attendee);
      }
      return accumulator;
    },
    {
      attending: [] as IAttendeeListRecord[],
      waitlisted: [] as IAttendeeListRecord[],
      cancelled: [] as IAttendeeListRecord[],
    },
  );
}

class EventDetailService implements IEventDetailService {
  async toggleRsvp(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventRsvpToggleError>> {
    if (actor.role !== "user") {
      return Err(EventAuthorizationError("Only members may RSVP for events."));
    }

    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      return Err(EventNotFoundError("Event not found."));
    }
    const eventResult = await this.contentRepository.findEventById(normalizedEventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }
    const event = eventResult.value;
    if (!event || event.status !== "published") {
      return Err(EventNotFoundError("Event not found or not open for RSVP."));
    }

    const rsvpsResult = await this.contentRepository.listRsvpsForUser(actor.userId);
    if (rsvpsResult.ok === false) {
      return Err(UnexpectedDependencyError(rsvpsResult.value.message));
    }
    const existingRsvp = rsvpsResult.value.find((rsvp) => rsvp.eventId === event.id);

    if (existingRsvp?.status === "going") {
      const atomicResult = await this.contentRepository.cancelGoingRsvpAndPromoteNextWaitlisted(
        event.id,
        actor.userId,
      );
      if (atomicResult.ok === false) {
        return Err(UnexpectedDependencyError(atomicResult.value.message));
      }
      return this.getEventDetail(event.id, actor);
    }

    const goingCountResult = await this.contentRepository.countGoingRsvpsForEvent(event.id);
    if (goingCountResult.ok === false) {
      return Err(UnexpectedDependencyError(goingCountResult.value.message));
    }
    const isFull = typeof event.capacity === "number" && goingCountResult.value >= event.capacity;

    let newStatus: "going" | "waitlisted" | "cancelled";
    if (existingRsvp?.status === "waitlisted") {
      newStatus = "cancelled";
    } else if (isFull) {
      newStatus = "waitlisted";
    } else {
      newStatus = "going";
    }

    const upsertResult = await this.contentRepository.upsertRsvp({
      id: existingRsvp ? existingRsvp.id : `${event.id}-${actor.userId}`,
      eventId: event.id,
      userId: actor.userId,
      status: newStatus,
    });
    if (upsertResult.ok === false) {
      return Err(UnexpectedDependencyError(upsertResult.value.message));
    }

    return this.getEventDetail(event.id, actor);
  }
  constructor(
    private readonly contentRepository: IHomeContentRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async getEventDetail(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventDetailError>> {
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

    const attendeeCountResult = await this.contentRepository.countGoingRsvpsForEvent(event.id);
    if (attendeeCountResult.ok === false) {
      return Err(UnexpectedDependencyError(attendeeCountResult.value.message));
    }

    const organizerResult = await this.userRepository.findById(event.organizerId);
    if (organizerResult.ok === false) {
      return Err(UnexpectedDependencyError(organizerResult.value.message));
    }

    const organizer = organizerResult.value;
    if (!organizer) {
      return Err(UnexpectedDependencyError("Unable to load the event organizer."));
    }

    // Find RSVP for this user/event
    let rsvpStatus = null;
    let isRsvpPending = false;
    let isFull = false;
    let waitlistPosition: number | null = null;
    try {
      const rsvpsResult = await this.contentRepository.listRsvpsForUser(actor.userId);
      if (rsvpsResult.ok) {
        const userRsvp = rsvpsResult.value.find((rsvp) => rsvp.eventId === event.id);
        rsvpStatus = userRsvp ? userRsvp.status : null;
      }
      const goingCountResult = await this.contentRepository.countGoingRsvpsForEvent(event.id);
      if (goingCountResult.ok) {
        isFull = typeof event.capacity === "number" && goingCountResult.value >= event.capacity;
      }
      if (rsvpStatus === "waitlisted") {
        const eventRsvpsResult = await this.contentRepository.listRsvpsForEvent(event.id);
        if (eventRsvpsResult.ok) {
          const waitlistedRsvps = eventRsvpsResult.value.filter((rsvp) => rsvp.status === "waitlisted");
          const queueIndex = waitlistedRsvps.findIndex((rsvp) => rsvp.userId === actor.userId);
          waitlistPosition = queueIndex >= 0 ? queueIndex + 1 : null;
        }
      }
    } catch (e) {
      // ignore RSVP errors for now
    }

    return Ok({
      ...toEventDetailView(event, organizer.displayName, attendeeCountResult.value, actor),
      rsvpStatus,
      waitlistPosition,
      isRsvpPending,
      isFull,
    });
  }

  async getAttendeeList(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IAttendeeListView, EventDetailError>> {
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
    if (!(actor.role === "admin" || actor.userId === event.organizerId)) {
      return Err(EventAuthorizationError("Only admins and the event organizer may view attendee lists."));
    }

    const attendeesResult = await this.contentRepository.listAttendeesForEvent(event.id);
    if (attendeesResult.ok === false) {
      return Err(UnexpectedDependencyError(attendeesResult.value.message));
    }

    const grouped = groupAttendees(attendeesResult.value);
    return Ok({
      eventId: event.id,
      eventTitle: event.title,
      attending: grouped.attending,
      waitlisted: grouped.waitlisted,
      cancelled: grouped.cancelled,
    });
  }
}

export function CreateEventDetailService(
  contentRepository: IHomeContentRepository,
  userRepository: IUserRepository,
): IEventDetailService {
  return new EventDetailService(contentRepository, userRepository);
}

export {
  buildEventPermissionFlags,
  normalizeEventId,
  toEventDetailView,
};
