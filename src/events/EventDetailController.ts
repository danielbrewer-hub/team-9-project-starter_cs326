import type { Request, Response } from "express";
import { AuthenticationRequired } from "../auth/errors";
import type { IAuthenticatedUser } from "../auth/User";
import {
  recordPageView,
  type IAppBrowserSession,
} from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IEventDetailService } from "./EventDetailService";


export interface IEventDetailController {
  showEventDetail(req: Request, res: Response): Promise<void>;
  toggleRsvp(req: Request, res: Response): Promise<void>;
  showEditForm(req:Request,res:Response):Promise<void>;
  publishEvent(req:Request,res:Response):Promise<void>;
  cancelEvent(req:Request,res:Response):Promise<void>;
}

class EventDetailController implements IEventDetailController {
  constructor(
    private readonly service: IEventDetailService,
    private readonly logger: ILoggingService,
  ) {}

  private isHtmxRequest(req: Request): boolean {
    return req.get("HX-Request") === "true";
  }

  private isRsvpDashboardRequest(req: Request): boolean {
    return this.isHtmxRequest(req) && req.get("HX-RSVP-Dashboard") === "true";
  }

  async toggleRsvp(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);
    const eventId = typeof req.params.id === "string" ? req.params.id : "";

    if (!actor) {
      this.logger.warn("Blocked unauthenticated RSVP toggle request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    if (actor.role !== "user") {
      this.logger.warn(`Blocked RSVP toggle attempt by ${actor.role} user ${actor.id}`);
      res.status(403).render("partials/error", {
        message: "Only members may RSVP for events.",
        layout: false,
      });
      return;
    }

    try {
      // Pass userId for IActingUser, which is actor.id from IAuthenticatedUser
      const result = await this.service.toggleRsvp(eventId, { userId: actor.id, role: actor.role });
      if (!result.ok) throw result.value;

      this.logger.info(`POST /events/${eventId}/rsvp/toggle by ${actor.id}`);
      if (this.isRsvpDashboardRequest(req)) {
        res.set("HX-Trigger", "rsvp-dashboard-refresh");
        res.status(204).send();
      } else if (this.isHtmxRequest(req)) {
        res.render("events/partials/rsvp-toggle-response", {
          session: browserSession,
          event: result.value,
          layout: false,
        });
      } else {
        res.redirect(`/events/${eventId}`);
      }
    } catch (error: any) {
      if (error?.name === "EventNotFoundError") {
        this.logger.warn(`Event not found for RSVP toggle: ${eventId}`);
        res.status(404).render("partials/error", {
          message: error.message || "Event not found.",
          layout: false,
        });
        return;
      }
      if (error?.name === "EventAuthorizationError") {
        this.logger.warn(`Unauthorized RSVP toggle attempt by ${actor.id}`);
        res.status(403).render("partials/error", {
          message: error.message || "You are not allowed to RSVP for this event.",
          layout: false,
        });
        return;
      }
      if (error?.name === "EventValidationError") {
        this.logger.warn(`Validation error on RSVP toggle: ${error.message}`);
        res.status(400).render("partials/error", {
          message: error.message || "Invalid RSVP action.",
          layout: false,
        });
        return;
      }
      this.logger.error(`Unexpected error in RSVP toggle: ${error?.message || error}`);
      res.status(500).render("partials/error", {
        message: "Unable to update RSVP at this time.",
        layout: false,
      });
    }
  }

  private toActor(session: IAppBrowserSession): IAuthenticatedUser | null {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      return null;
    }
    // Map IAuthenticatedUserSession to IAuthenticatedUser (id, not userId)
    return {
      id: authenticatedUser.userId,
      email: authenticatedUser.email,
      displayName: authenticatedUser.displayName,
      role: authenticatedUser.role,
    };
  }

  async showEventDetail(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);
    const eventId = typeof req.params.id === "string" ? req.params.id : "";

    if (!actor) {
      this.logger.warn("Blocked unauthenticated event detail request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }

    const result = await this.service.getEventDetail(eventId, {
      userId: actor.id,
      role: actor.role,
    });

    if (result.ok) {
      this.logger.info(`GET /events/${result.value.id} for ${browserSession.browserLabel}`);
      if(this.isHtmxRequest(req)){
        res.render("events/detail",{
          session:browserSession,
          event:result.value,
          layout:false
        }
        )
        return;
      } 
      res.render("events/detail", {
        session: browserSession,
        event: result.value,
      });
      return;
    }

    if (result.ok === false) {
      const error = result.value;

      if (error.name === "EventNotFoundError") {
        this.logger.warn(`Event detail not found for id ${eventId}`);
        res.status(404).render("partials/error", {
          message: error.message,
          layout: false,
        });
        return;
      }

      this.logger.error(`Failed to load event detail: ${error.message}`);
      res.status(500).render("partials/error", {
        message: "Unable to load the event right now.",
        layout: false,
      });
    }
  }
  async showEditForm(req:Request,res:Response):Promise<void> {
    const browserSession = recordPageView(req.session);
    const actor = this.toActor(browserSession);
    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    
    if (!actor) {
      this.logger.warn("Blocked unauthenticated edit request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }
    const event = await this.service.getEventDetail(eventId,{userId:actor.id,role:actor.role})
    try{
      if (!event.ok) throw event.value;
      if(actor.role == "user"){
        this.logger.warn(`Blocked edit attempt by ${actor.id}`);
        res.status(403).render("partials/error", {
          message: "Only admins and the event organizer may edit events.",
          layout: false,
        });
        return;
      }
      if(!event.value.canEdit){
        this.logger.warn(`Blocked edit attempt by ${actor.id}`)
        res.status(403).render("partials/error",{
          message: "This event cannot be edited, either you are not the event organizer, or this event has already started.",
          layout:false,
        });
        return;
      }
      if (req.get("HX-Request") === "true"){
        res.render("events/partials/edit-form",{event:event.value, session:browserSession,layout:false})
      }
    }
    catch(error:any){
      if (error.name === "EventNotFoundError") {
        this.logger.warn(`Event detail not found for id ${eventId}`);
        res.status(404).render("partials/error", {
          message: error.message,
          layout: false,
        });
        return;
      }

      this.logger.error(`Failed to load event detail: ${error.message}`);
      res.status(500).render("partials/error", {
        message: "Unable to load the event right now.",
        layout: false,
      });
    }
  }
  
  async publishEvent(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session)
    const actor = this.toActor(browserSession)
    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    if(!actor){
      this.logger.warn("Blocked unauthenticated publish request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }
    const event = await this.service.getEventDetail(eventId,{userId:actor.id,role:actor.role});
    try{
      if(!event.ok) throw event.value;
       if(actor.role == "user"){
        this.logger.warn(`Blocked publication attempt by ${actor.id}`);
        res.status(403).render("partials/error", {
          message: "Only admins and the event organizer may publish an event.",
          layout: false,
        });
        return;
      }
      if(!event.value.canEdit){
        this.logger.warn(`Event cannot be published, attempt by ${actor.id}`)
        res.status(403).render("partials/error",{
          message: "This event cannot be published, either you are not the event organizer, or this event is not eligible for publication.",
          layout:false,
        });
        return;
      }
      if(event.value.status == "draft"){
        const published = await this.service.publishEvent(eventId,{userId:actor.id,role:actor.role})
        if(!published.ok){
          this.logger.warn(`Event with Id ${eventId} could not be published.`);
          res.status(404).render("partials/error",{
            message:"Event not found.",
            layout:false
          });
        }
        return;
      }
    }
    catch(error:any){
      if (error.name === "EventNotFoundError") {
        this.logger.warn(`Event detail not found for id ${eventId}`);
        res.status(404).render("partials/error", {
          message: error.message,
          layout: false,
        });
        return;
      }

      this.logger.error(`Failed to load event detail: ${error.message}`);
      res.status(500).render("partials/error", {
        message: "Unable to load the event right now.",
        layout: false,
      });
    }
  }
  
  async cancelEvent(req: Request, res: Response): Promise<void> {
    const browserSession = recordPageView(req.session)
    const actor = this.toActor(browserSession)
    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    if(!actor){
      this.logger.warn("Blocked unauthenticated cancel request");
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return;
    }
    const event = await this.service.getEventDetail(eventId,{userId:actor.id,role:actor.role});
    try{
      if(!event.ok) throw event.value;
       if(actor.role == "user"){
        this.logger.warn(`Blocked cancellation attempt by ${actor.id}`);
        res.status(403).render("partials/error", {
          message: "Only admins and the event organizer may cancel an event.",
          layout: false,
        });
        return;
      }
      if(!event.value.canCancel){
        this.logger.warn(`Event cannot be cancelled, attempt by ${actor.id}`)
        res.status(403).render("partials/error",{
          message: "This event cannot be cancelled, either you are not the event organizer, or this event is not eligible for cancellation.",
          layout:false,
        });
        return;
      }
      if(event.value.status == "draft" || event.value.status == "published"){
        const cancelled = await this.service.cancelEvent(eventId,{userId:actor.id,role:actor.role});
        if(!cancelled.ok){
          this.logger.warn(`Event with Id ${eventId} could not be cancelled.`);
          res.status(404).render("partials/error",{
            message:"Event not found.",
            layout:false
          });
        }
        return;
      }
    }
    catch(error:any){
      if (error.name === "EventNotFoundError") {
        this.logger.warn(`Event detail not found for id ${eventId}`);
        res.status(404).render("partials/error", {
          message: error.message,
          layout: false,
        });
        return;
      }

      this.logger.error(`Failed to load event detail: ${error.message}`);
      res.status(500).render("partials/error", {
        message: "Unable to load the event right now.",
        layout: false,
      });
    }
  }
}

export function CreateEventDetailController(
  service: IEventDetailService,
  logger: ILoggingService,
): IEventDetailController {
  return new EventDetailController(service, logger);
}
