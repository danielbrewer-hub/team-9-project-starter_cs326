export type EventNotFoundError = {
  name: "EventNotFoundError";
  message: string;
};

export type EventForbiddenError = {
  name: "EventForbiddenError";
  message: string;
};

export type EventInvalidTransitionError = {
  name: "EventInvalidTransitionError";
  message: string;
};

export type EventUnexpectedDependencyError = {
  name: "UnexpectedDependencyError";
  message: string;
};

export type EventLifecycleError =
  | EventNotFoundError
  | EventForbiddenError
  | EventInvalidTransitionError
  | EventUnexpectedDependencyError;

export function NotFoundError(message: string): EventNotFoundError {
  return { name: "EventNotFoundError", message };
}

export function ForbiddenError(message: string): EventForbiddenError {
  return { name: "EventForbiddenError", message };
}

export function InvalidTransitionError(message: string): EventInvalidTransitionError {
  return { name: "EventInvalidTransitionError", message };
}

export function UnexpectedDependencyError(message: string): EventUnexpectedDependencyError {
  return { name: "UnexpectedDependencyError", message };
}