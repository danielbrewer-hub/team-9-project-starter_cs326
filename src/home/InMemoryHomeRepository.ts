import { Ok, type Result } from "../lib/result";
import type {
  IAlpineDemoContent,
  IHomeContentRepository,
  IHomeTip,
} from "./HomeRepository";

class InMemoryHomeContentRepository implements IHomeContentRepository {
  async listGettingStartedTips(): Promise<Result<IHomeTip[], Error>> {
    return Ok([
      {
        title: "Replace this dashboard",
        description: "Turn `/home` into your project's real landing page or workspace.",
      },
      {
        title: "Add feature routes",
        description: "Register URLs in `src/app.ts` and point them at controller methods.",
      },
      {
        title: "Build views and services together",
        description: "Let controllers render EJS while services return `Result<T, E>` values.",
      },
      {
        title: "Prepare your data model",
        description: "Add tables to `prisma/schema.prisma` now so the repository swap is easy later.",
      },
    ]);
  }

  async getAlpineDemoContent(): Promise<Result<IAlpineDemoContent, Error>> {
    return Ok({
      title: "Alpine.js Demo",
      description:
        "Alpine.js is included via CDN and ready to use. This collapsible section demonstrates a tiny interactive island inside an EJS page.",
      helperText: "A simple Alpine.js counter",
      buttonLabel: "Clicked:",
    });
  }
}

export function CreateInMemoryHomeContentRepository(): IHomeContentRepository {
  return new InMemoryHomeContentRepository();
}
