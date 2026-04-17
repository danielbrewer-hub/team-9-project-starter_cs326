import { Err, Ok, type Result } from "../lib/result";
import type { IAuthenticatedUser } from "../auth/User";
import { canViewEvent } from "../events/EventVisibility";
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

export interface IHomeService {
  getHomePageData(
    actor: IAuthenticatedUser,
  ): Promise<Result<IHomePageData, HomeServiceError>>;
}

function UnexpectedDependencyError(message: string): HomeServiceError {
  return { name: "UnexpectedDependencyError", message };
}

class HomeService implements IHomeService {
  constructor(private readonly contentRepository: IHomeContentRepository) {}

  async getHomePageData(
    actor: IAuthenticatedUser,
  ): Promise<Result<IHomePageData, HomeServiceError>> {
    const eventsResult = await this.contentRepository.listEvents();
    if (eventsResult.ok === false) {
      return Err(UnexpectedDependencyError(eventsResult.value.message));
    }

    const visibleEvents = eventsResult.value.filter((event) =>
      canViewEvent(event, actor.id, actor.role),
    );

    const recentEvents: IHomePageData["recentEvents"] = [];
    for (const event of visibleEvents) {
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

    const publishedCount = visibleEvents.filter((event) => event.status === "published").length;
    const organizerCount = new Set(visibleEvents.map((event) => event.organizerId)).size;

    return Ok({
      welcomeTitle: "Welcome to Project Starter",
      welcomeMessage:
        "You are signed in and ready to build. The in-memory repository now models events and RSVPs behind exported repository functions.",
      signedInSummary: `${actor.displayName} (${actor.email}, role: ${actor.role})`,
      eventSummary: [
        `${visibleEvents.length} total events`,
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
