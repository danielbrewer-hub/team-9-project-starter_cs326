import type { Event } from './Event'

export interface EventRepository {
  getAllPublished(): Event[]
  searchPublished(query: string): Event[]
  findById(id: string): Event | undefined
  create(event: Event): Event
  update(id: string, updates: Partial<Event>): Event | undefined
}