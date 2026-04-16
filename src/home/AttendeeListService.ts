import { Err, Ok, type Result } from "../lib/result";
import type { IAuthenticatedUser } from "../auth/User";
import type { IUserRepository } from "../auth/UserRepository";
import type { IHomeContentRepository } from "./HomeRepository";

export interface IAttendeeListEntry {
  userId: string;
  displayName: string;
  rsvpAt: string;
}

export interface IAttendeeListData {
  attending: IAttendeeListEntry[];
  waitlisted: IAttendeeListEntry[];
  cancelled: IAttendeeListEntry[];
}

export type AttendeeListError = {
  name: "ValidationError" | "AuthorizationRequired" | "UnexpectedDependencyError";
  message: string;
};

function ValidationError(message: string): AttendeeListError {
  return { name: "ValidationError", message };
}

function AuthorizationRequired(message: string): AttendeeListError {
  return { name: "AuthorizationRequired", message };
}

function UnexpectedDependencyError(message: string): AttendeeListError {
  return { name: "UnexpectedDependencyError", message };
}

export interface IAttendeeListService {
  getAttendeeList(
    eventId: string,
    actor: IAuthenticatedUser,
  ): Promise<Result<IAttendeeListData, AttendeeListError>>;
}

class AttendeeListService implements IAttendeeListService {
  constructor(
    private readonly homeRepository: IHomeContentRepository,
    private readonly users: IUserRepository,
  ) {}

  async getAttendeeList(
    eventId: string,
    actor: IAuthenticatedUser,
  ): Promise<Result<IAttendeeListData, AttendeeListError>> {
    const eventResult = await this.homeRepository.findEventById(eventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    const event = eventResult.value;
    if (!event) {
      return Err(ValidationError("Event not found."));
    }

    const canView = actor.role === "admin" || event.organizerId === actor.id;
    if (!canView) {
      return Err(
        AuthorizationRequired("Only the event organizer or an admin may view attendees."),
      );
    }

    const rsvpsResult = await this.homeRepository.listRsvpsForEvent(eventId);
    if (rsvpsResult.ok === false) {
      return Err(UnexpectedDependencyError(rsvpsResult.value.message));
    }

    const attending: IAttendeeListEntry[] = [];
    const waitlisted: IAttendeeListEntry[] = [];
    const cancelled: IAttendeeListEntry[] = [];

    const orderedRsvps = [...rsvpsResult.value].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );

    for (const rsvp of orderedRsvps) {
      const userResult = await this.users.findById(rsvp.userId);
      if (userResult.ok === false) {
        return Err(UnexpectedDependencyError(userResult.value.message));
      }

      const attendee = userResult.value;
      if (!attendee) {
        return Err(
          UnexpectedDependencyError(`Unable to resolve attendee for RSVP ${rsvp.id}.`),
        );
      }

      const entry: IAttendeeListEntry = {
        userId: attendee.id,
        displayName: attendee.displayName,
        rsvpAt: rsvp.createdAt,
      };

      if (rsvp.status === "going") {
        attending.push(entry);
      } else if (rsvp.status === "waitlisted") {
        waitlisted.push(entry);
      } else {
        cancelled.push(entry);
      }
    }

    return Ok({ attending, waitlisted, cancelled });
  }
}

export function CreateAttendeeListService(
  homeRepository: IHomeContentRepository,
  users: IUserRepository,
): IAttendeeListService {
  return new AttendeeListService(homeRepository, users);
}
