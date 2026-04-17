import type { EventService, InvalidSearchError } from './EventService'
import type { Request, Response } from 'express'

export interface IEventController {
  list(req: Request, res: Response): Promise<void>
  search(req: Request, res: Response): Promise<void>
}

class EventController implements IEventController {
  constructor(private readonly eventService: EventService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const category = typeof req.query.category === 'string' ? req.query.category : ''
    const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : 'all'

    const result = await this.eventService.filterEvents({ category, timeframe })

    if (!result.ok) {
      res.status(500).render('partials/error', { message: 'Something went wrong.' })
      return
    }

    res.render('events/list', {
      events: result.value,
      searchQuery: '',
      category,
      timeframe,
      error: null,
    })
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const q = typeof req.query.q === 'string' ? req.query.q : ''

    const result = await this.eventService.searchEvents({ q })

    if (!result.ok) {
      res.render('events/list', {
        events: [],
        searchQuery: q,
        category: '',
        timeframe: 'all',
        error: (result.value as InvalidSearchError).message,
      })
      return
    }

    res.render('events/list', {
      events: result.value,
      searchQuery: q,
      category: '',
      timeframe: 'all',
      error: null,
    })
  }
}

export function CreateEventController(eventService: EventService): IEventController {
  return new EventController(eventService)
}