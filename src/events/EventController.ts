import type { EventService, InvalidSearchError } from './EventService'
import type { Request, Response } from 'express'
import { touchAppSession, type AppSessionStore } from '../session/AppSession'

export interface IEventController {
  list(req: Request, res: Response): Promise<void>
  search(req: Request, res: Response): Promise<void>
}

class EventController implements IEventController {
  constructor(private readonly eventService: EventService) {}

  private getSession(req: Request) {
    return touchAppSession(req.session as AppSessionStore)
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const category = typeof req.query.category === 'string' ? req.query.category : ''
    const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : 'all'
    const isHtmx = req.get('HX-Request') === 'true'
    const session = this.getSession(req)

    const result = await this.eventService.filterEvents({ category, timeframe })

    if (!result.ok) {
      res.status(500).render('partials/error', { message: 'Something went wrong.', layout: false })
      return
    }

    const locals = {
      session,
      events: result.value,
      searchQuery: '',
      category,
      timeframe,
      error: null,
    }

    if (isHtmx) {
      res.render('events/_event_list', { ...locals, layout: false })
      return
    }

    res.render('events/list', locals)
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const q = typeof req.query.q === 'string' ? req.query.q : ''
    const isHtmx = req.get('HX-Request') === 'true'
    const session = this.getSession(req)

    const result = await this.eventService.searchEvents({ q })

    const baseLocals = result.ok
      ? { events: result.value, error: null }
      : { events: [], error: (result.value as InvalidSearchError).message }

    const locals = {
      session,
      searchQuery: q,
      category: '',
      timeframe: 'all',
      ...baseLocals,
    }

    if (isHtmx) {
      res.render('events/_event_list', { ...locals, layout: false })
      return
    }

    res.render('events/list', locals)
  }
}

export function CreateEventController(eventService: EventService): IEventController {
  return new EventController(eventService)
}
