# Feature 1 (Aaron)
Routes:
GET /events/new -> eventCreationController.showCreateEventForm()
POST /events -> eventCreationController.createEventFromForm()

Interfaces:
EventStatus: Union type for an event status:
    export type EventStatus = "draft" | "published" | "cancelled" | "past";
IEventRecord: Shared stored event record used by the repository and both event features:
    export interface IEventRecord {
    id: string;
    title: string;
    description: string;
    location: string;
    category: string;
    status: EventStatus;
    capacity?: number;
    startDatetime: string;
    endDatetime: string;
    organizerId: string;
    createdAt: string;
    updatedAt: string;
    }
IActingUser: Session-derived identity passed into event services:
    export interface IActingUser {
    userId: string;
    role: UserRole;
    }
ICreateEventInput: Form payload used by the creation flow:
    export interface ICreateEventInput {
    title: string;
    description: string;
    location: string;
    category: string;
    capacity?: string;
    startDatetime: string;
    endDatetime: string;
    }
HomeRepository ICreateEventInput: Repository payload used after validation to store a new event:
    export interface ICreateEventInput {
    id: string;
    title: string;
    description: string;
    location: string;
    category: string;
    status: EventStatus;
    capacity?: number;
    startDatetime: string;
    endDatetime: string;
    organizerId: string;
    }
IEventCreationController: The controller for the event creation flow:
    export interface IEventCreationController {
    showCreateEventForm(req: Request, res: Response): Promise<void>;
    createEventFromForm(req: Request, res: Response): Promise<void>;
    }
IEventCreationService: The service that validates input and creates draft events:
    export interface IEventCreationService {
    createEvent(
        input: ICreateEventInput,
        actor: IActingUser,
    ): Promise<Result<IEventRecord, EventCreationError>>;
    }

Error Type:
EventValidationError: Validation failure for bad form input:
    export type EventValidationError = {
    name: "EventValidationError";
    message: string;
    field?: string;
    };
EventAuthorizationError: Returned when a non-organizer tries to create an event:
    export type EventAuthorizationError = {
    name: "EventAuthorizationError";
    message: string;
    };
EventUnexpectedDependencyError: Returned when the repository fails unexpectedly:
    export type EventUnexpectedDependencyError = {
    name: "UnexpectedDependencyError";
    message: string;
    };
EventCreationError: Union type for creation failures:
    export type EventCreationError =
    | EventValidationError
    | EventAuthorizationError
    | EventUnexpectedDependencyError;

Factory Helpers:
For EventCreationController:
    export function CreateEventCreationController(
    service: IEventCreationService,
    logger: ILoggingService,
    ): IEventCreationController {
    return new EventCreationController(service, logger);
    }
For EventCreationService:
    export function CreateEventCreationService(
    contentRepository: IHomeContentRepository,
    ): IEventCreationService {
    return new EventCreationService(contentRepository);
    }

Other Helpers:
In HomeRepository.ts:
  createEvent(input: ICreateEventInput): Promise<Result<IEventRecord, Error>>;
    Stores the server-generated draft event record


# Feature 2 (Aaron)
Routes:
GET /events/:id -> eventDetailController.showEventDetail()

Interfaces:
IEventDetailView: Event record plus organizer and attendee data for the detail page:
    export interface IEventDetailView extends IEventRecord {
    organizerDisplayName: string;
    attendeeCount: number;
    canEdit: boolean;
    canCancel: boolean;
    canRsvp: boolean;
    }
IEventDetailController: The controller for the event detail page:
    export interface IEventDetailController {
    showEventDetail(req: Request, res: Response): Promise<void>;
    }
IEventDetailService: The service that loads and authorizes event detail data:
    export interface IEventDetailService {
    getEventDetail(
        eventId: string,
        actor: IActingUser,
    ): Promise<Result<IEventDetailView, EventDetailError>>;
    }
Visibility Helpers:
In EventVisibility.ts:
  export function canManageEvent(
    event: IEventRecord,
    actorUserId: string,
    actorRole: UserRole,
  ): boolean;
    Returns true when the actor is the organizer for the event or has the admin role
  export function canViewEvent(
    event: IEventRecord,
    actorUserId: string,
    actorRole: UserRole,
  ): boolean;
    Returns true for all non-draft events and only for organizer/admin viewers on drafts

Error Type:
EventNotFoundError: Returned for missing events and unauthorized draft viewers:
    export type EventNotFoundError = {
    name: "EventNotFoundError";
    message: string;
    };
EventDetailError: Union type for detail-page failures:
    export type EventDetailError =
    | EventNotFoundError
    | EventUnexpectedDependencyError;

Factory Helpers:
For EventDetailController:
    export function CreateEventDetailController(
    service: IEventDetailService,
    logger: ILoggingService,
    ): IEventDetailController {
    return new EventDetailController(service, logger);
    }
For EventDetailService:
    export function CreateEventDetailService(
    contentRepository: IHomeContentRepository,
    userRepository: IUserRepository,
    ): IEventDetailService {
    return new EventDetailService(contentRepository, userRepository);
    }

Other Helpers:
In HomeRepository.ts:
  findEventById(eventId: string): Promise<Result<IEventRecord | null, Error>>;
    Returns the stored event or null
  countGoingRsvpsForEvent(eventId: string): Promise<Result<number, Error>>;
    Counts only RSVPs with status "going" for the detail page
In UserRepository.ts:
  findById(id: string): Promise<Result<IUserRecord | null, AuthError>>;
    Loads the organizer so the detail page can show organizerDisplayName


# Feature 3 (Dan)

# Feature 4 (Isik)

# Feature 5 (Dan)

# Feature 6 (Aditya)

# Feature 7 (Isik)
Routes:
GET /rsvp -> rsvpDashboardController.showRsvpDashboard()
POST /rsvp/:id/cancel -> rsvpDashboardController.cancelRsvp()

Interfaces:
RsvpStatus: Union type for an RSVP status:
    export type RsvpStatus = "going" | "waitlisted" | "cancelled";
ICreateRsvpInput: Type used to create or update an Rsvp entry:
    export interface ICreateRsvpInput {
    id: string;
    eventId: string;
    userId: string;
    status: RsvpStatus;
    }
IRsvpRecord: A single RSVP for the repository (internal):
    export interface IRsvpRecord {
    id: string;
    eventId: string;
    userId: string;
    status: RsvpStatus;
    createdAt: string;
    }
IRsvpDashboardItem: A single RSVP used in the dashboard:
    export interface IRsvpDashboardItem {
    id: string;
    title: string;
    category: string;
    location: string;
    dateLabel: string;
    timeLabel: string;
    rsvpStatus: string;
    eventStatus: string;
    }
IRsvpDashboardData: A list of RSVPs:
    export interface IRsvpDashboardData {
    upcomingRsvps: IRsvpDashboardItem[];
    pastRsvps: IRsvpDashboardItem[];
    }
IRsvpDashboardController: The controller for the dashboard:
    export interface IRsvpDashboardController {
    showRsvpDashboard(req: Request, res: Response): Promise<void>;
    cancelRsvp(req: Request, res: Response): Promise<void>;
    }
IRsvpDashboardService: The service for the dashboard:
    export interface IRsvpDashboardService {
    getRsvpDashboardData(
        actor: IAuthenticatedUser,
    ): Promise<Result<IRsvpDashboardData, RsvpDashboardError>>;
    cancelRsvp(
        rsvpId: string,
        actor: IAuthenticatedUser,
    ): Promise<Result<void, RsvpDashboardError>>;
    }

Error Type:
RsvpDashboardError: Union type for any potential RSVP related errors:
    export type RsvpDashboardError = {
    name: "ValidationError" | "UnexpectedDependencyError";
    message: string;
    };

Factory Helpers:
For RsvpDashboardController:
    export function CreateRsvpDashboardController(
    service: IRsvpDashboardService,
    logger: ILoggingService,
    ): IRsvpDashboardController {
    return new RsvpDashboardController(service, logger);
    }
For RsvpDashboardService:
    export function CreateRsvpDashboardService(
    repository: IHomeContentRepository,
    ): IRsvpDashboardService {
    return new RsvpDashboardService(repository);
    }

Other Helpers:
In HomeRepository.ts:
  listRsvpsForEvent(eventId: string): Promise<Result<IRsvpRecord[], Error>>;
    Returns all RSVP records for an event
  listRsvpsForUser(userId: string): Promise<Result<IRsvpRecord[], Error>>;
    Returns all RSVP records for a user
  upsertRsvp(input: ICreateRsvpInput): Promise<Result<IRsvpRecord, Error>>;
    Creates or updates an RSVP record. Returns the updated value.


# Feature 9 (Allen)

# Feature 10 (Aditya)

# Feature 12 (Allen)
