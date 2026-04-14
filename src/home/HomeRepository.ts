import type { Result } from "../lib/result";

export interface IHomeTip {
  title: string;
  description: string;
}

export interface IAlpineDemoContent {
  title: string;
  description: string;
  helperText: string;
  buttonLabel: string;
}

export interface IHomeContentRepository {
  listGettingStartedTips(): Promise<Result<IHomeTip[], Error>>;
  getAlpineDemoContent(): Promise<Result<IAlpineDemoContent, Error>>;
}
