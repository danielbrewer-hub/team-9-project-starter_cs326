import { Err, Ok, type Result } from "../lib/result";
import type { IAuthenticatedUser } from "../auth/User";
import type {
  IHomeContentRepository,
} from "./HomeRepository";

export type HomeServiceError = {
  name: "UnexpectedDependencyError";
  message: string;
};

export interface IHomePageData {
  welcomeTitle: string;
  welcomeMessage: string;
  signedInSummary: string;
  eventSummary: string[];
  recentEvents: Array<{
    id: string;
    title: string;
    status: string;
    location: string;
    category: string;
    attendeeCount: number;
  }>;
}

export interface IEventUpdateFields {
  title: string;
  body: string;
  location: string;
  category: string;
  capacity?: number;
}

export interface IHomeService {
  getHomePageData(
    actor: IAuthenticatedUser,
  ): Promise<Result<IHomePageData, HomeServiceError>>;

   updateEvent(
    actor: IAuthenticatedUser,
    eventId: string,
    fields: IEventUpdateFields,
  ): Promise<Result<IHomePageData["recentEvents"][number], HomeServiceError>>;
}

function UnexpectedDependencyError(message: string): HomeServiceError {
  return { name: "UnexpectedDependencyError", message };
}

class HomeService implements IHomeService {
  constructor(private readonly contentRepository: IHomeContentRepository) {}

   async updateEvent(
    actor: IAuthenticatedUser,
    eventId: string,
    fields: IEventUpdateFields,
  ): Promise<Result<IHomePageData["recentEvents"][number], HomeServiceError>> {
    const findResult = await this.contentRepository.findEventById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }

    if (findResult.value === null) {
      return Err(NotFoundError(`Event ${eventId} not found.`));
    }

    const updateResult = await this.contentRepository.updateEvent(eventId, {
      title: fields.title,
      body: fields.body,
      location: fields.location,
      category: fields.category,
      ...(fields.capacity !== undefined && { capacity: fields.capacity }),
    });

    if (updateResult.ok === false) {
      return Err(UnexpectedDependencyError(updateResult.value.message));
    }

    const updated = updateResult.value;

    const rsvpResult = await this.contentRepository.listRsvpsForEvent(eventId);
    if (rsvpResult.ok === false) {
      return Err(UnexpectedDependencyError(rsvpResult.value.message));
    }

    const attendeeCount = rsvpResult.value.filter(
      (rsvp) => rsvp.status === "going",
    ).length;

    return Ok({
      id: updated.id,
      title: updated.title,
      status: updated.status,
      location: updated.location,
      category: updated.category,
      attendeeCount,
    });
  }

  async getHomePageData(
    actor: IAuthenticatedUser,
  ): Promise<Result<IHomePageData, HomeServiceError>> {
    const eventsResult = await this.contentRepository.listEvents();
    if (eventsResult.ok === false) {
      return Err(UnexpectedDependencyError(eventsResult.value.message));
    }

    const recentEvents: IHomePageData["recentEvents"] = [];
    for (const event of eventsResult.value) {
      const rsvpResult = await this.contentRepository.listRsvpsForEvent(event.id);
      if (rsvpResult.ok === false) {
        return Err(UnexpectedDependencyError(rsvpResult.value.message));
      }

      recentEvents.push({
        id: event.id,
        title: event.title,
        status: event.status,
        location: event.location,
        category: event.category,
        attendeeCount: rsvpResult.value.filter((rsvp) => rsvp.status === "going").length,
      });
    }

    const publishedCount = eventsResult.value.filter((event) => event.status === "published").length;
    const organizerCount = new Set(eventsResult.value.map((event) => event.organizerId)).size;

    return Ok({
      welcomeTitle: "Welcome to Project Starter",
      welcomeMessage:
        "You are signed in and ready to build. The in-memory repository now models events and RSVPs behind exported repository functions.",
      signedInSummary: `${actor.displayName} (${actor.email}, role: ${actor.role})`,
      eventSummary: [
        `${eventsResult.value.length} total events`,
        `${publishedCount} published events`,
        `${organizerCount} organizers represented`,
      ],
      recentEvents: recentEvents.slice(0, 5),
    });
  }
}

export function CreateHomeService(contentRepository: IHomeContentRepository): IHomeService {
  return new HomeService(contentRepository);
}
