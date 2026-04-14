import { Err, Ok, type Result } from "../lib/result";
import type { IAuthenticatedUser } from "../auth/User";
import type {
  IAlpineDemoContent,
  IHomeContentRepository,
  IHomeTip,
} from "./HomeRepository";

export type HomeServiceError = {
  name: "UnexpectedDependencyError";
  message: string;
};

export interface IHomePageData {
  welcomeTitle: string;
  welcomeMessage: string;
  signedInSummary: string;
  gettingStartedTips: IHomeTip[];
  alpineDemo: IAlpineDemoContent;
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
    const tipsResult = await this.contentRepository.listGettingStartedTips();
    if (tipsResult.ok === false) {
      return Err(UnexpectedDependencyError(tipsResult.value.message));
    }

    const alpineDemoResult = await this.contentRepository.getAlpineDemoContent();
    if (alpineDemoResult.ok === false) {
      return Err(UnexpectedDependencyError(alpineDemoResult.value.message));
    }

    return Ok({
      welcomeTitle: "Welcome to Project Starter",
      welcomeMessage:
        "You are signed in and ready to build. This page now flows through a repository, service, and controller so the starter demonstrates the intended architecture.",
      signedInSummary: `${actor.displayName} (${actor.email}, role: ${actor.role})`,
      gettingStartedTips: tipsResult.value,
      alpineDemo: alpineDemoResult.value,
    });
  }
}

export function CreateHomeService(contentRepository: IHomeContentRepository): IHomeService {
  return new HomeService(contentRepository);
}
