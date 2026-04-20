import { randomUUID } from 'crypto'
import type { Event } from './Event'
import type { EventRepository } from './EventRepository'

const store = new Map<string, Event>()

function makeDate(daysFromNow: number, extraHours = 0): Date {
  return new Date(
    Date.now() +
    daysFromNow * 24 * 60 * 60 * 1000 +
    extraHours * 60 * 60 * 1000
  )
}

const seedEvents: Event[] = [
  {
    id: randomUUID(),
    title: 'Sunday Soccer Pickup',
    description: 'Casual pickup soccer at Mullins Center. All skill levels welcome.',
    location: 'Mullins Center, UMass Amherst',
    category: 'sports',
    status: 'published',
    capacity: 22,
    startDatetime: makeDate(2),
    endDatetime: makeDate(2, 2),
    organizerId: 'seed-organizer-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    title: 'Resume Workshop',
    description: 'Career center workshop on writing strong resumes for software engineering.',
    location: 'Career Center Room 203',
    category: 'educational',
    status: 'published',
    capacity: 30,
    startDatetime: makeDate(5),
    endDatetime: makeDate(5, 1),
    organizerId: 'seed-organizer-2',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    title: 'Campus Cleanup Volunteer Day',
    description: 'Help keep campus clean. Gloves and bags provided.',
    location: 'Campus Pond',
    category: 'volunteer',
    status: 'published',
    capacity: null,
    startDatetime: makeDate(1),
    endDatetime: makeDate(1, 3),
    organizerId: 'seed-organizer-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    title: 'Spring Social Mixer',
    description: 'Meet new people and enjoy snacks at this campus social event.',
    location: 'Campus Center Auditorium',
    category: 'social',
    status: 'published',
    capacity: 200,
    startDatetime: makeDate(6),
    endDatetime: makeDate(6, 2),
    organizerId: 'seed-organizer-2',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    title: 'Jazz Night at the Blue Wall',
    description: 'Live jazz performance by the UMass Jazz Ensemble.',
    location: 'Blue Wall, Student Union',
    category: 'arts',
    status: 'draft',
    capacity: 100,
    startDatetime: makeDate(3),
    endDatetime: makeDate(3, 2),
    organizerId: 'seed-organizer-3',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

seedEvents.forEach((e) => store.set(e.id, e))

export class InMemoryEventRepository implements EventRepository {
  getAllPublished(): Event[] {
    return [...store.values()]
      .filter((e) => e.status === 'published')
      .sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime())
  }

  searchPublished(query: string): Event[] {
    const q = query.toLowerCase().trim()
    const now = new Date()
    return [...store.values()]
      .filter((e) => {
        if (e.status !== 'published') return false
        if (e.endDatetime <= now) return false
        if (!q) return true
        return (
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime())
  }

  findById(id: string): Event | undefined {
    return store.get(id)
  }

  create(event: Event): Event {
    store.set(event.id, event)
    return event
  }

  update(id: string, updates: Partial<Event>): Event | undefined {
    const existing = store.get(id)
    if (!existing) return undefined
    const updated: Event = { ...existing, ...updates, updatedAt: new Date() }
    store.set(id, updated)
    return updated
  }
}