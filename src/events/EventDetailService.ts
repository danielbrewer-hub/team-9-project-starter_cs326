import { Err, Ok, type Result } from "../lib/result";
import type { IUserRepository } from "../auth/UserRepository";
import type { IEventRecord, IHomeContentRepository } from "../home/HomeRepository";
import {
  EventNotFoundError,
  UnexpectedDependencyError,
  type EventDetailError,
} from "./errors";
import type { IActingUser, IEventDetailView } from "./EventTypes";

type EventPermissionFlags = Pick<IEventDetailView, "canEdit" | "canCancel" | "canRsvp">;

export interface IEventDetailService {
  getEventDetail(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventDetailError>>;
}

function canViewEventDetail(event: IEventRecord, actor: IActingUser): boolean {
  if (event.status !== "draft") {
    return true;
  }

  return actor.role === "admin" || event.organizerId === actor.userId;
}

function buildEventPermissionFlags(
  event: IEventRecord,
  actor: IActingUser,
): EventPermissionFlags {
  const canManage = actor.role === "admin" || event.organizerId === actor.userId;

  return {
    canEdit: canManage,
    canCancel: canManage,
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
  };
}

class EventDetailService implements IEventDetailService {
  constructor(
    private readonly contentRepository: IHomeContentRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async getEventDetail(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventDetailError>> {
    const eventResult = await this.contentRepository.findEventById(eventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    const event = eventResult.value;
    if (!event || !canViewEventDetail(event, actor)) {
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

    return Ok(
      toEventDetailView(event, organizer.displayName, attendeeCountResult.value, actor),
    );
  }
}

export function CreateEventDetailService(
  contentRepository: IHomeContentRepository,
  userRepository: IUserRepository,
): IEventDetailService {
  return new EventDetailService(contentRepository, userRepository);
}

export { buildEventPermissionFlags, canViewEventDetail, toEventDetailView };
