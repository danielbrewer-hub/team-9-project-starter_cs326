import type { Request, Response } from 'express'
import type { EventService, InvalidSearchError } from './EventService'
import { AppSessionStore, recordPageView } from '../session/AppSession'

export class EventController {
  constructor(private readonly eventService: EventService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const session = recordPageView(req.session as AppSessionStore)
    const category = typeof req.query.category === 'string' ? req.query.category : ''
    const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : 'all'

    const result = this.eventService.filterEvents({ category, timeframe })

    if (!result.ok) {
      res.status(500).render('partials/error', { message: 'Something went wrong.' })
      return
    }

    res.render('events/list', {
      session,
      events: result.value,
      searchQuery: '',
      category,
      timeframe,
      error: null,
    })
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const session = recordPageView(req.session as AppSessionStore)
    const q = typeof req.query.q === 'string' ? req.query.q : ''

    const result = this.eventService.searchEvents({ q })

    if (!result.ok) {
      res.render('events/list', {
        session,
        events: [],
        searchQuery: q,
        category: '',
        timeframe: 'all',
        error: (result.value as InvalidSearchError).message,
      })
      return
    }

    res.render('events/list', {
      session,
      events: result.value,
      searchQuery: q,
      category: '',
      timeframe: 'all',
      error: null,
    })
  }
}