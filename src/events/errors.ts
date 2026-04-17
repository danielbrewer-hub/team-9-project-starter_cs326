export type EventValidationError = {
  name: "EventValidationError";
  message: string;
  field?: string;
};

export type EventAuthorizationError = {
  name: "EventAuthorizationError";
  message: string;
};

export type EventNotFoundError = {
  name: "EventNotFoundError";
  message: string;
};

export type EventUnexpectedDependencyError = {
  name: "UnexpectedDependencyError";
  message: string;
};

export type EventCreationError =
  | EventValidationError
  | EventAuthorizationError
  | EventUnexpectedDependencyError;

export type EventDetailError = EventNotFoundError | EventUnexpectedDependencyError;

export type EventRsvpToggleError =
  | EventNotFoundError
  | EventAuthorizationError
  | EventValidationError
  | EventUnexpectedDependencyError;

export function EventValidationError(message: string, field?: string): EventValidationError {
  return {
    name: "EventValidationError",
    message,
    field,
  };
}

export function EventAuthorizationError(message: string): EventAuthorizationError {
  return {
    name: "EventAuthorizationError",
    message,
  };
}

export function EventNotFoundError(message: string): EventNotFoundError {
  return {
    name: "EventNotFoundError",
    message,
  };
}

export function UnexpectedDependencyError(message: string): EventUnexpectedDependencyError {
  return {
    name: "UnexpectedDependencyError",
    message,
  };
}
