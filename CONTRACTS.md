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
    Unauthorized draft viewers receive 404 instead of 403 so the application does not reveal that the draft exists.
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
Routes:
POST /events/:id/rsvp/toggle -> eventDetailController.toggleRsvp()

Interfaces:
RsvpStatus: Union type for an RSVP status:
    export type RsvpStatus = "going" | "waitlisted" | "cancelled";
ICreateRsvpInput: Repository payload used to create or update an RSVP:
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
IEventDetailView RSVP fields: Event detail view data used to render the RSVP button state:
    export interface IEventDetailView extends IEventRecord {
    organizerDisplayName: string;
    attendeeCount: number;
    canEdit: boolean;
    canCancel: boolean;
    canRsvp: boolean;
    rsvpStatus?: RsvpStatus | null;
    isRsvpPending?: boolean;
    isFull?: boolean;
    }
IEventDetailController: The controller for the event detail page and RSVP toggle:
    export interface IEventDetailController {
    showEventDetail(req: Request, res: Response): Promise<void>;
    toggleRsvp(req: Request, res: Response): Promise<void>;
    }
IEventDetailService: The service that loads event detail data and toggles RSVPs:
    export interface IEventDetailService {
    getEventDetail(
        eventId: string,
        actor: IActingUser,
    ): Promise<Result<IEventDetailView, EventDetailError>>;
    toggleRsvp(
        eventId: string,
        actor: IActingUser,
    ): Promise<Result<IEventDetailView, EventRsvpToggleError>>;
    }

Error Type:
EventNotFoundError: Returned for missing events and events that are not open for RSVP:
    export type EventNotFoundError = {
    name: "EventNotFoundError";
    message: string;
    };
EventAuthorizationError: Returned when a non-member actor tries to RSVP:
    export type EventAuthorizationError = {
    name: "EventAuthorizationError";
    message: string;
    };
EventValidationError: Returned when the RSVP toggle request is invalid:
    export type EventValidationError = {
    name: "EventValidationError";
    message: string;
    field?: string;
    };
EventRsvpToggleError: Union type for RSVP toggle failures:
    export type EventRsvpToggleError =
    | EventNotFoundError
    | EventAuthorizationError
    | EventValidationError
    | EventUnexpectedDependencyError;

Behavior:
RSVP button state:
    The event detail page shows an RSVP action only when canRsvp is true.
    canRsvp is true only for member users viewing a published event.
    The button label reflects rsvpStatus and isFull: "RSVP Going", "Join
    Waitlist", "Cancel RSVP", or "Leave Waitlist".
Toggle access:
    The toggle route requires an authenticated actor. Member users may toggle RSVPs.
    Staff organizers and admins are rejected because organizers do not attend
    events. Cancelled and past events are not open for RSVP toggles.
Toggle status rules:
    A new RSVP becomes "going" when the event has capacity available.
    A new RSVP becomes "waitlisted" when the event is full.
    An existing "going" RSVP is changed to "cancelled".
    An existing "waitlisted" RSVP is changed to "cancelled".
    An existing "cancelled" RSVP is reactivated as "going" when capacity is
    available or "waitlisted" when the event is full.
Immediate update:
    The RSVP controls render inside the #rsvp-action-area element. The RSVP form
    uses HTMX as the default enhanced path: it posts to
    /events/:id/rsvp/toggle, targets #rsvp-action-area, and swaps the returned
    partial into that element so the button state updates without a full page
    reload.
    The server returns an HTML fragment for HTMX requests, not JSON and not a
    full page. The fragment includes the updated RSVP action area and may include
    out-of-band HTML for related page fragments such as the attendee count.
    Non-HTMX requests are the fallback path and redirect back to the event detail
    page after the RSVP state changes.

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
  listRsvpsForUser(userId: string): Promise<Result<IRsvpRecord[], Error>>;
    Returns all RSVP records for the actor so the service can find the event RSVP
  countGoingRsvpsForEvent(eventId: string): Promise<Result<number, Error>>;
    Counts only RSVPs with status "going" for capacity and attendee totals
  upsertRsvp(input: ICreateRsvpInput): Promise<Result<IRsvpRecord, Error>>;
    Creates or updates the in-memory RSVP record and returns the stored value

# Feature 5 (Dan)

# Feature 6 (Aditya)

# Feature 7 (Isik)
Routes:
GET /rsvp -> rsvpDashboardController.showRsvpDashboard()
POST /rsvp/:id/cancel -> rsvpDashboardController.cancelRsvp()
POST /events/:id/rsvp/toggle -> eventDetailController.toggleRsvp()
    Used by the dashboard HTMX cancel action so Feature 7 reuses the Feature 4
    RSVP toggle route.

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
IAuthenticatedUser: Session-derived identity passed into the RSVP dashboard service:
    export interface IAuthenticatedUser {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    }
IRsvpDashboardItem: A single RSVP used in the dashboard:
    export interface IRsvpDashboardItem {
    id: string;
    eventId: string;
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

Behavior:
Dashboard access:
    The dashboard requires an authenticated actor. Only users may view it.
    Staff organizer and admin accounts are blocked because organizers do not
    attend events.
Dashboard grouping:
    getRsvpDashboardData loads the actor's RSVP records, resolves each RSVP's event
    with findEventById, and maps the combined data into IRsvpDashboardItem values.
    RSVP records with status "going" or "waitlisted" are placed in upcomingRsvps
    when the event is not "past" or "cancelled".
    RSVP records with status "cancelled" or events with status "past" or
    "cancelled" are placed in pastRsvps.
Dashboard sorting:
    Upcoming RSVPs should be sorted by event startDatetime ascending so the next
    event appears first.
    Past and cancelled RSVPs should be sorted by event startDatetime descending
    so the most recent old or cancelled event appears first.
Dashboard event links:
    Upcoming RSVP items expose eventId and link to /events/:id using the same
    event detail route and link styling as the home page event listings.
Cancel RSVP:
    cancelRsvp verifies the RSVP belongs to the actor, rejects already-cancelled
    RSVPs, rejects RSVPs for past or cancelled events, and persists the change by
    upserting the RSVP with status "cancelled".
Immediate update:
    The RSVP dashboard renders its upcoming and past/cancelled sections inside
    #rsvp-dashboard-sections. Dashboard cancel forms keep
    /rsvp/:id/cancel as the non-HTMX fallback action, but use HTMX to post to
    /events/:id/rsvp/toggle.
    HTMX dashboard cancel requests identify themselves with HX-RSVP-Dashboard:
    true. After the RSVP toggle succeeds, the server reloads the dashboard data
    and returns the #rsvp-dashboard-sections HTML fragment with layout disabled.
    HTMX swaps that fragment into the page so upcoming rows, past/cancelled rows,
    counts, and empty states update without a full page reload.
    Non-HTMX cancel requests are the fallback path and redirect back to /rsvp.

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
  findEventById(eventId: string): Promise<Result<IEventRecord | null, Error>>;
    Returns the stored event or null so RSVP dashboard items can include event details
  listRsvpsForEvent(eventId: string): Promise<Result<IRsvpRecord[], Error>>;
    Returns all RSVP records for an event
  listRsvpsForUser(userId: string): Promise<Result<IRsvpRecord[], Error>>;
    Returns all RSVP records for a user
  upsertRsvp(input: ICreateRsvpInput): Promise<Result<IRsvpRecord, Error>>;
    Creates or updates an RSVP record. Returns the updated value.


# Feature 9 (Allen)

# Feature 10 (Aditya)

# Feature 12 (Allen)
