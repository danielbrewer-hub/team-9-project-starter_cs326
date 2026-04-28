import { randomUUID } from "node:crypto";
import { Err, Ok, type Result } from "../lib/result";
import type { IEventRecord, IHomeContentRepository, IUpdateEventInput } from "../home/HomeRepository";
import {
  EventAuthorizationError,
  EventValidationError,
  UnexpectedDependencyError,
  type EventCreationError,
} from "./errors";
import type { IActingUser, ICreateEventInput } from "./EventTypes";

type NormalizedCreateEventInput = {
  title: string;
  description: string;
  location: string;
  category: string;
  capacity?: number;
  startDatetime: string;
  endDatetime: string;
};

export interface IEventCreationService {
  createEvent(
    input: ICreateEventInput,
    actor: IActingUser,
  ): Promise<Result<IEventRecord, EventCreationError>>;

   finalizeEdits(
    eventID:string,
    input:ICreateEventInput,
    actor: IActingUser,
  ):Promise<Result<IEventRecord | null,Error>>;
}

function normalizeRequiredText(
  value: string,
  field: keyof Pick<
    ICreateEventInput,
    "title" | "description" | "location" | "category"
  >,
  label: string,
): Result<string, EventCreationError> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return Err(EventValidationError(`${label} is required.`, field));
  }

  return Ok(trimmed);
}

function normalizeCapacity(value?: string): Result<number | undefined, EventCreationError> {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return Ok(undefined);
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return Err(EventValidationError("Capacity must be a positive whole number.", "capacity"));
  }

  return Ok(parsed);
}

function normalizeDatetime(
  value: string,
  field: keyof Pick<ICreateEventInput, "startDatetime" | "endDatetime">,
  label: string,
): Result<Date, EventCreationError> {
  if (value.trim().length === 0) {
    return Err(EventValidationError(`${label} is required.`, field));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return Err(EventValidationError(`${label} must be a valid date and time.`, field));
  }

  return Ok(parsed);
}

function normalizeCreateEventInput(
  input: ICreateEventInput,
): Result<NormalizedCreateEventInput, EventCreationError> {
  const title = normalizeRequiredText(input.title, "title", "Title");
  if (title.ok === false) {
    return title;
  }

  const description = normalizeRequiredText(input.description, "description", "Description");
  if (description.ok === false) {
    return description;
  }

  const location = normalizeRequiredText(input.location, "location", "Location");
  if (location.ok === false) {
    return location;
  }

  const category = normalizeRequiredText(input.category, "category", "Category");
  if (category.ok === false) {
    return category;
  }

  const capacity = normalizeCapacity(input.capacity);
  if (capacity.ok === false) {
    return capacity;
  }

  const startDatetime = normalizeDatetime(input.startDatetime, "startDatetime", "Start time");
  if (startDatetime.ok === false) {
    return startDatetime;
  }

  const endDatetime = normalizeDatetime(input.endDatetime, "endDatetime", "End time");
  if (endDatetime.ok === false) {
    return endDatetime;
  }

  if (endDatetime.value.valueOf() <= startDatetime.value.valueOf()) {
    return Err(
      EventValidationError("End time must be after the start time.", "endDatetime"),
    );
  }

  return Ok({
    title: title.value,
    description: description.value,
    location: location.value,
    category: category.value,
    capacity: capacity.value,
    startDatetime: startDatetime.value.toISOString(),
    endDatetime: endDatetime.value.toISOString(),
  });
}

function canCreateEvents(actor: IActingUser): boolean {
  return actor.role === "staff" || actor.role === "admin";
}

function toStoredEventInput(normalized: NormalizedCreateEventInput, actor: IActingUser) {
  return {
    id: randomUUID(),
    title: normalized.title,
    description: normalized.description,
    location: normalized.location,
    category: normalized.category,
    status: "draft" as const,
    capacity: normalized.capacity,
    startDatetime: normalized.startDatetime,
    endDatetime: normalized.endDatetime,
    organizerId: actor.userId,
  };
}

class EventCreationService implements IEventCreationService {
  constructor(private readonly contentRepository: IHomeContentRepository) {}

  async createEvent(
    input: ICreateEventInput,
    actor: IActingUser,
  ): Promise<Result<IEventRecord, EventCreationError>> {
    if (!canCreateEvents(actor)) {
      return Err(EventAuthorizationError("Only organizers and admins can create events."));
    }

    const normalized = normalizeCreateEventInput(input);
    if (normalized.ok === false) {
      return normalized;
    }

    const createdResult = await this.contentRepository.createEvent(
      toStoredEventInput(normalized.value, actor),
    );

    if (createdResult.ok === false) {
      return Err(
        UnexpectedDependencyError(
          createdResult.value.message || "Unable to store the new event.",
        ),
      );
    }

    return Ok(createdResult.value);
  }

  async finalizeEdits(eventId:string,input:ICreateEventInput, actor: IActingUser): Promise<Result<IEventRecord | null,Error>> {
      const event = await this.contentRepository.findEventById(eventId);
      const normalizedInput = normalizeCreateEventInput(input)
      try{
        if(!event.ok ||!event.value){
        throw("Event Not Found")
      }
        if(event.value.organizerId!==actor.userId && actor.role!== "admin"){
          return Err(EventValidationError("Contact the organizer or an admin to edit this event."))
        }
        if(!normalizedInput.ok){
          throw normalizedInput.value
        }
        
        const updateInput:IUpdateEventInput = {
          title:normalizedInput.value.title,
          description:normalizedInput.value.description,
          location:normalizedInput.value.location,
          category:normalizedInput.value.category,
          startDatetime:normalizedInput.value.startDatetime,
          endDatetime:normalizedInput.value.endDatetime
        }
        if(input.capacity){
          updateInput.capacity = normalizedInput.value.capacity;
        }
        return this.contentRepository.updateEvent(eventId,updateInput);
      }
      catch(error:any){
        return Err(UnexpectedDependencyError(error));
      }   
  }
}

export function CreateEventCreationService(
  contentRepository: IHomeContentRepository,
): IEventCreationService {
  return new EventCreationService(contentRepository);
}

export { canCreateEvents, normalizeCreateEventInput, toStoredEventInput };
