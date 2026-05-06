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

Behavior:
Creation access:
    The creation form and submission route require an authenticated actor.
    Staff and admin users may create events. User accounts receive a 403 response.
Draft creation:
    Successful creation always stores a new event with status "draft". organizerId,
    createdAt, and updatedAt are server-owned values derived outside the form.
HTTP response mapping:
    EventValidationError responses use status 400 and render the creation form with
    field or form-level errors. EventAuthorizationError responses use status 403.
    EventUnexpectedDependencyError responses use status 500. Non-HTMX successful
    submissions redirect to /events/:id for the created event.
Immediate update:
    The creation form submits with HTMX to /events, targets the form container, and
    swaps the returned partial into that element. HTMX validation failures return
    only the form fragment with errors. HTMX success returns only a success fragment
    with a link to the created event detail page.

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

Behavior:
Detail access:
    Published, cancelled, and past events are visible to any authenticated actor.
    Draft events are visible only to the owning organizer and admin users.
HTTP response mapping:
    EventNotFoundError responses use status 404 for both missing events and hidden
    draft events. EventUnexpectedDependencyError responses use status 500.
    Successful requests render the event detail page.

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
Routes:
GET /events/:id/edit -> eventDetailController.showEditForm()

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
    The RSVP controls use Alpine.js state initialized from the server-rendered
    event detail data. Tailwind CSS classes make each state visually distinct:
    available, full, going, waitlisted, and disabled/pending.
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
    Alpine.js reinitializes from the returned fragment after the HTMX swap and
    applies a smooth visual transition to the RSVP button and helper text.
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
GET /rsvp/partials/sections -> rsvpDashboardController.renderRsvpDashboardSections()
POST /rsvp/:id/cancel -> rsvpDashboardController.cancelRsvp()
POST /events/:id/rsvp/toggle -> eventDetailController.toggleRsvp()
    Used by the dashboard HTMX cancel action so Feature 7 reuses the Feature 4
    RSVP toggle route. Dashboard-origin HTMX requests receive an HX-Trigger
    response instead of dashboard HTML.

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
    renderRsvpDashboardSections(req: Request, res: Response): Promise<void>;
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
Dashboard section fragment:
    renderRsvpDashboardSections uses the same access rules as showRsvpDashboard.
    It reloads the actor's dashboard data and renders only the
    rsvp/partials/dashboard-sections fragment with layout disabled.
    This route is used only for HTMX dashboard refreshes and does not render the
    full RSVP dashboard page.
Cancel RSVP:
    cancelRsvp verifies the RSVP belongs to the actor, rejects already-cancelled
    RSVPs, rejects RSVPs for past or cancelled events, and persists the change by
    upserting the RSVP with status "cancelled".
Immediate update:
    The RSVP dashboard renders its upcoming and past/cancelled sections inside
    #rsvp-dashboard-sections. That section listens for the
    rsvp-dashboard-refresh HTMX trigger and refreshes itself from
    /rsvp/partials/sections.
    Dashboard cancel forms keep /rsvp/:id/cancel as the non-HTMX fallback action,
    but use HTMX to post to /events/:id/rsvp/toggle with hx-swap="none".
    HTMX dashboard cancel requests identify themselves with HX-RSVP-Dashboard:
    true. After the RSVP toggle succeeds, the Feature 4 route returns an
    empty 204 response with HX-Trigger: rsvp-dashboard-refresh. HTMX then asks
    the Feature 7 partial route for the updated #rsvp-dashboard-sections HTML
    fragment with layout disabled.
    HTMX swaps that refreshed section into the page so upcoming rows,
    past/cancelled rows, counts, and empty states update without a full page
    reload.
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

Attendee list access and rendering:
From the event detail page, attendee identities are visible only to:
    The event organizer (event.organizerId matches actor.userId), or
    Any admin user.
Members and non-organizer staff users are denied attendee-list access.

Route:
GET /events/:id/attendees:
    Requires an authenticated session.
    Uses EventDetailController.showAttendees.
    For HTMX requests (HX-Request: true), returns the attendee-list partial only.
    For non-HTMX requests, returns a full attendee-list page fallback.
    Returns:
        200 on success,
        403 for unauthorized actor,
        404 when event id is invalid or missing,
        500 for dependency failures.

EventDetailService contract additions:
In EventDetailService.ts:
  getAttendeeList(
    eventId: string,
    actor: IActingUser,
  ): Promise<Result<IEventAttendeeListView, EventAttendeeListError>>;

EventTypes:
AttendeeListStatus:
    "going" | "waitlisted" | "cancelled"
IEventAttendeeEntry:
    userId: string
    displayName: string
    status: AttendeeListStatus
    rsvpCreatedAt: string
IEventAttendeeListView:
    eventId: string
    attendees: Record<AttendeeListStatus, IEventAttendeeEntry[]>

Service behavior:
getAttendeeList:
    Trims and validates eventId; blank event ids return EventNotFoundError.
    Loads event and returns EventNotFoundError when missing.
    Enforces authorization (organizer or admin only), otherwise EventAuthorizationError.
    Loads attendee rows from HomeRepository attendee projection.
    Groups rows into:
        attendees.going
        attendees.waitlisted
        attendees.cancelled
    Sorts each group by RSVP createdAt ascending.
    Returns IEventAttendeeListView.

Repository contract additions:
In HomeRepository.ts:
  interface IEventAttendeeRecord extends IRsvpRecord {
    displayName: string;
  }
  listRsvpAttendeesForEvent(
    eventId: string,
  ): Promise<Result<IEventAttendeeRecord[], Error>>;

Repository behavior:
listRsvpAttendeesForEvent:
    Returns RSVP rows for the event joined with attendee display names.
    Rows are sorted by createdAt ascending.
    Preserves RSVP fields (id, eventId, userId, status, createdAt) and adds
    displayName.

InMemoryHomeRepository implementation:
    Resolves displayName by matching RSVP userId to in-memory demo users and
    returns attendee rows sorted by createdAt ascending.

PrismaHomeRepository implementation:
    Resolves displayName via Prisma relation join:
        rsvp include user select displayName
    Maps joined rows to IEventAttendeeRecord and returns createdAt as ISO
    strings.

UI behavior:
Event detail page includes an attendee-list load action for authorized users.
HTMX button:
    GET /events/:id/attendees
    target: #attendee-list-container
    swap: innerHTML
Partial shows three grouped sections:
    Attending, Waitlisted, Cancelled
Each entry shows attendee displayName and RSVP createdAt timestamp.

Tests:
EventDetailService tests cover:
    organizer/admin authorized access,
    member/non-organizer staff denial,
    grouping and per-group ordering.
EventDetailApp tests cover:
    GET /events/:id/attendees authorized HTMX access and unauthorized denial.
HomeRepositoryContract tests cover:
    listRsvpAttendeesForEvent behavior for both in-memory and Prisma implementations.

# Repository

Prisma structure:
The Prisma repository is a second implementation of the existing
IHomeContentRepository interface. It must preserve the same repository return
types and behavior as InMemoryHomeRepository.

Environment configuration:
HOME_REPOSITORY: Selects the HomeRepository implementation used by the running
application:
    "memory": Uses CreateInMemoryHomeContentRepository().
    "prisma": Uses CreatePrismaHomeContentRepository() with DATABASE_URL.
    Missing HOME_REPOSITORY defaults to "memory".
    Any other value is invalid and should fail startup with a clear error.
DATABASE_URL:
    Used only when HOME_REPOSITORY is "prisma".
    Points Prisma to the SQLite database file.

Prisma schema models:
User:
    id: string primary key
    email: string unique
    displayName: string
    role: string
    passwordHash: string

Event:
    id: string primary key
    title: string
    description: string
    location: string
    category: string
    status: string
    capacity?: number | null
    startDatetime: DateTime
    endDatetime: DateTime
    organizerId: string
    organizer: User relation
    createdAt: DateTime
    updatedAt: DateTime
    rsvps: Rsvp[]

Rsvp:
    id: string primary key
    eventId: string
    event: Event relation
    userId: string
    user: User relation
    status: string
    createdAt: DateTime
    Unique index on eventId and userId so one user has at most one RSVP per
    event.

Interfaces:
PrismaHomeContentRepository: Database-backed implementation of
IHomeContentRepository:
    class PrismaHomeContentRepository implements IHomeContentRepository

Factory Helper:
For PrismaHomeContentRepository:
    export function CreatePrismaHomeContentRepository(
        prisma: PrismaClient,
    ): IHomeContentRepository {
        return new PrismaHomeContentRepository(prisma);
    }

Mapping:
    Event DateTime fields are converted to ISO strings when returning
    IEventRecord.
    Null capacity values are returned as undefined so IEventRecord keeps
    capacity optional.
    RSVP DateTime fields are converted to ISO strings when returning
    IRsvpRecord.
    Prisma string status values are returned as EventStatus and RsvpStatus only
    after they have been written from the existing repository input types.

Behavior:
listEvents:
    Returns all event records as IEventRecord values.
findEventById:
    Returns the stored event as IEventRecord or null when the event does not
    exist.
createEvent:
    Creates an event from ICreateEventInput and returns the stored IEventRecord.
    createdAt and updatedAt are set by the database.
updateEvent:
    Updates the event fields from IUpdateEventInput, returns the updated
    IEventRecord, and returns null when the event does not exist.
listRsvpsForEvent:
    Returns all RSVP records for the event sorted by createdAt ascending.
countGoingRsvpsForEvent:
    Counts only RSVP records whose status is "going".
listRsvpsForUser:
    Returns all RSVP records for the user sorted by createdAt ascending.
upsertRsvp:
    Creates or updates an RSVP record using the unique eventId and userId pair.
    Existing RSVP records keep their original id and createdAt and update only
    the status. New RSVP records use the input id and receive createdAt from the
    database.

Errors:
    Database failures are returned as Err(Error) so services can map them to
    UnexpectedDependencyError.

Tests:
    The Prisma repository should pass the HomeRepositoryContract test suite by
    adding the Prisma factory as another implementation of IHomeContentRepository.
