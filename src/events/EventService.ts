import { Ok, Err, type Result } from '../lib/result'
import type { EventRepository } from './EventRepository'
import type { Event, EventCategory, Timeframe } from './Event'
import { VALID_CATEGORIES, VALID_TIMEFRAMES } from './Event'

export interface InvalidSearchError {
  name: 'InvalidSearchError'
  message: string
}

export class EventService {
  constructor(private readonly repo: EventRepository) {}

  filterEvents(params: {
    category?: string
    timeframe?: string
  }): Result<Event[], never> {
    const now = new Date()
    let results = this.repo.getAllPublished()

    if (params.category && VALID_CATEGORIES.includes(params.category as EventCategory)) {
      results = results.filter((e) => e.category === (params.category as EventCategory))
    }

    const timeframe: Timeframe = VALID_TIMEFRAMES.includes(params.timeframe as Timeframe)
      ? (params.timeframe as Timeframe)
      : 'all'

    if (timeframe === 'this-week') {
      const weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() + 7)
      results = results.filter(
        (e) => e.startDatetime >= now && e.startDatetime < weekEnd
      )
    } else if (timeframe === 'this-weekend') {
      const dayOfWeek = now.getDay()
      const daysUntilSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek + 7) % 7
      const satStart = new Date(now)
      satStart.setHours(0, 0, 0, 0)
      satStart.setDate(satStart.getDate() + daysUntilSat)
      const sunEnd = new Date(satStart)
      sunEnd.setDate(sunEnd.getDate() + 2)
      results = results.filter(
        (e) => e.startDatetime >= satStart && e.startDatetime < sunEnd
      )
    } else {
      results = results.filter((e) => e.startDatetime >= now)
    }

    return Ok(results)
  }

  searchEvents(params: { q?: string }): Result<Event[], InvalidSearchError> {
    const query = (params.q ?? '').trim()

    if (query.length > 200) {
      return Err({
        name: 'InvalidSearchError' as const,
        message: 'Search query cannot exceed 200 characters.',
      })
    }

    return Ok(this.repo.searchPublished(query))
  }
}