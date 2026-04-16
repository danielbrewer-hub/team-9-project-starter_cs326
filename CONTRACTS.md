# Feature 1 (Aaron)

# Feature 2 (Aaron)

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