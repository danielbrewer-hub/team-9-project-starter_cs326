import { Err, Ok, type Result } from "../lib/result";
import type { IActingUser } from "./EventTypes";
import type { IEventDetailView } from "./EventTypes";
import type { IHomeContentRepository } from "../home/HomeRepository";
import type { IUserRepository } from "../auth/UserRepository";
import {
  NotFoundError,
  ForbiddenError,
  InvalidTransitionError,
  UnexpectedDependencyError,
  type EventLifecycleError,
} from "./EventLifecycleErrors";

export interface IEventLifecycleService {
  publishEvent(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventLifecycleError>>;

  cancelEvent(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventLifecycleError>>;
}

class EventLifecycleService implements IEventLifecycleService {
  constructor(
    private readonly contentRepository: IHomeContentRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async publishEvent(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventLifecycleError>> {
    const findResult = await this.contentRepository.findEventById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (findResult.value === null) {
      return Err(NotFoundError(`Event ${eventId} not found.`));
    }

    const event = findResult.value;

    if (actor.role !== "admin" && event.organizerId !== actor.userId) {
      return Err(ForbiddenError("Only the organizer or an admin can publish this event."));
    }

    if (event.status !== "draft") {
      return Err(InvalidTransitionError(
        `Cannot publish an event with status "${event.status}". Only draft events can be published.`,
      ));
    }

    const updateResult = await this.contentRepository.updateEvent(eventId, {
      status: "published",
    });
    if (updateResult.ok === false) {
      return Err(UnexpectedDependencyError(updateResult.value.message));
    }
    if (updateResult.value === null) {
      return Err(NotFoundError(`Event ${eventId} disappeared during update.`));
    }

    return this.buildDetailView(updateResult.value.id, actor);
  }

  async cancelEvent(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventLifecycleError>> {
    const findResult = await this.contentRepository.findEventById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (findResult.value === null) {
      return Err(NotFoundError(`Event ${eventId} not found.`));
    }

    const event = findResult.value;

    if (actor.role !== "admin" && event.organizerId !== actor.userId) {
      return Err(ForbiddenError("Only the organizer or an admin can cancel this event."));
    }

    if (event.status !== "published") {
      return Err(InvalidTransitionError(
        `Cannot cancel an event with status "${event.status}". Only published events can be cancelled.`,
      ));
    }

    const updateResult = await this.contentRepository.updateEvent(eventId, {
      status: "cancelled",
    });
    if (updateResult.ok === false) {
      return Err(UnexpectedDependencyError(updateResult.value.message));
    }
    if (updateResult.value === null) {
      return Err(NotFoundError(`Event ${eventId} disappeared during update.`));
    }

    return this.buildDetailView(updateResult.value.id, actor);
  }

  private async buildDetailView(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventDetailView, EventLifecycleError>> {
    const findResult = await this.contentRepository.findEventById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (findResult.value === null) {
      return Err(NotFoundError(`Event ${eventId} not found.`));
    }

    const event = findResult.value;

    const organizerResult = await this.userRepository.findById(event.organizerId);
    if (organizerResult.ok === false) {
      return Err(UnexpectedDependencyError(organizerResult.value.message));
    }

    const organizerDisplayName = organizerResult.value?.displayName ?? "Unknown organizer";

    const countResult = await this.contentRepository.countGoingRsvpsForEvent(eventId);
    if (countResult.ok === false) {
      return Err(UnexpectedDependencyError(countResult.value.message));
    }

    const isOrganizer = event.organizerId === actor.userId;
    const isAdmin = actor.role === "admin";

    return Ok({
      ...event,
      organizerDisplayName,
      attendeeCount: countResult.value,
      canEdit: (isOrganizer || isAdmin) && event.status === "draft",
      canCancel: (isOrganizer || isAdmin) && event.status === "published",
      canRsvp: event.status === "published" && !isOrganizer,
    });
  }
}

export function CreateEventLifecycleService(
  contentRepository: IHomeContentRepository,
  userRepository: IUserRepository,
): IEventLifecycleService {
  return new EventLifecycleService(contentRepository, userRepository);
}