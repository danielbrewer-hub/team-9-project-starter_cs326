import { Ok, Err, type Result } from '../lib/result'
import type { IHomeContentRepository, IEventRecord } from '../home/HomeRepository'
import type { EventCategory, Timeframe } from './Event'
import { VALID_CATEGORIES, VALID_TIMEFRAMES } from './Event'

export interface InvalidSearchError {
  name: 'InvalidSearchError'
  message: string
}

export class EventService {
  constructor(private readonly repo: IHomeContentRepository) {}

  async filterEvents(params: {
    category?: string
    timeframe?: string
  }): Promise<Result<IEventRecord[], never>> {
    const result = await this.repo.listEvents()
    if (!result.ok) return Ok([])

    const now = new Date()
    let evts = result.value.filter(e => e.status === 'published')

    if (params.category && VALID_CATEGORIES.includes(params.category as EventCategory)) {
      evts = evts.filter(e => e.category === params.category)
    }

    const timeframe = VALID_TIMEFRAMES.includes(params.timeframe as Timeframe)
      ? (params.timeframe as Timeframe)
      : 'all'

    if (timeframe === 'this-week') {
      const weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() + 7)
      evts = evts.filter(e => {
        const start = new Date(e.startDatetime)
        return start >= now && start < weekEnd
      })
    } else if (timeframe === 'this-weekend') {
      const dayOfWeek = now.getDay()
      const daysUntilSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek + 7) % 7
      const satStart = new Date(now)
      satStart.setHours(0, 0, 0, 0)
      satStart.setDate(satStart.getDate() + daysUntilSat)
      const sunEnd = new Date(satStart)
      sunEnd.setDate(sunEnd.getDate() + 2)
      evts = evts.filter(e => {
        const start = new Date(e.startDatetime)
        return start >= satStart && start < sunEnd
      })
    } else {
      evts = evts.filter(e => new Date(e.startDatetime) >= now)
    }

    evts.sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime())
    return Ok(evts)
  }

  async searchEvents(params: {
    q?: string
  }): Promise<Result<IEventRecord[], InvalidSearchError>> {
    const query = (params.q ?? '').trim()

    if (query.length > 200) {
      return Err({ name: 'InvalidSearchError' as const, message: 'Search query cannot exceed 200 characters.' })
    }

    const result = await this.repo.listEvents()
    if (!result.ok) return Ok([])

    const now = new Date()
    const q = query.toLowerCase()

    const results = result.value
      .filter(e => {
        if (e.status !== 'published') return false
        if (new Date(e.endDatetime) <= now) return false
        if (!q) return true
        return (
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime())

    return Ok(results)
  }
}

export function CreateEventService(repo: IHomeContentRepository): EventService {
  return new EventService(repo)
}
