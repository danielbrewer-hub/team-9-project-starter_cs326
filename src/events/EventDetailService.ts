import { Err, Ok, type Result } from "../lib/result";
import type { IUserRepository } from "../auth/UserRepository";
import type { IEventRecord, IHomeContentRepository } from "../home/HomeRepository";
import {
  EventAuthorizationError,
  EventNotFoundError,
  UnexpectedDependencyError,
  type EventDetailError,
  type EventRsvpToggleError,
} from "./errors";
import type { IActingUser, IEventDetailView } from "./EventTypes";
import { canManageEvent, canViewEvent } from "./EventVisibility";

type EventPermissionFlags = Pick<
  IEventDetailView,
  "canEdit" | "canCancel" | "canViewAttendeeList" | "canRsvp"
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
}

function normalizeEventId(eventId: string): string | null {
  const trimmed = eventId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildEventPermissionFlags(
  event: IEventRecord,
  actor: IActingUser,
): EventPermissionFlags {
  const canManage = canManageEvent(event, actor.userId, actor.role);
  return {
    canEdit: canManage,
    canCancel: canManage,
    canViewAttendeeList: canManage,
    canRsvp: actor.role === "user" && event.status === "published",
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

class EventDetailService implements IEventDetailService {
    async toggleRsvp(
      eventId: string,
      actor: IActingUser,
    ): Promise<Result<IEventDetailView, EventRsvpToggleError>> {
      if (actor.role !== "user") {
        return Err(EventAuthorizationError("Only members may RSVP for events."));
      }

      // 1. Find event
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

      // 2. Find existing RSVP for this user/event
      const rsvpsResult = await this.contentRepository.listRsvpsForUser(actor.userId);
      if (rsvpsResult.ok === false) {
        return Err(UnexpectedDependencyError(rsvpsResult.value.message));
      }
      const existingRsvp = rsvpsResult.value.find(r => r.eventId === event.id);

      // 3. Count current going RSVPs
      const goingCountResult = await this.contentRepository.countGoingRsvpsForEvent(event.id);
      if (goingCountResult.ok === false) {
        return Err(UnexpectedDependencyError(goingCountResult.value.message));
      }
      const isFull = typeof event.capacity === "number" && goingCountResult.value >= event.capacity;

      // 4. Decide new status

      let newStatus: "going" | "waitlisted" | "cancelled";
      if (existingRsvp?.status === "going" || existingRsvp?.status === "waitlisted") {
        newStatus = "cancelled";
      } else if (isFull) {
        newStatus = "waitlisted";
      } else {
        newStatus = "going";
      }

      // 5. Upsert RSVP
      const upsertResult = await this.contentRepository.upsertRsvp({
        id: existingRsvp ? existingRsvp.id : `${event.id}-${actor.userId}`,
        eventId: event.id,
        userId: actor.userId,
        status: newStatus,
      });
      if (upsertResult.ok === false) {
        return Err(UnexpectedDependencyError(upsertResult.value.message));
      }

      // 6. Return updated event detail
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
    try {
      const rsvpsResult = await this.contentRepository.listRsvpsForUser(actor.userId);
      if (rsvpsResult.ok) {
        const userRsvp = rsvpsResult.value.find(r => r.eventId === event.id);
        rsvpStatus = userRsvp ? userRsvp.status : null;
      }
      const goingCountResult = await this.contentRepository.countGoingRsvpsForEvent(event.id);
      if (goingCountResult.ok) {
        isFull = typeof event.capacity === "number" && goingCountResult.value >= event.capacity;
      }
    } catch (e) {
      // ignore RSVP errors for now
    }

    return Ok({
      ...toEventDetailView(event, organizer.displayName, attendeeCountResult.value, actor),
      rsvpStatus,
      isRsvpPending,
      isFull,
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
