export type EventStatus = 'draft' | 'published' | 'cancelled' | 'past'

export type EventCategory =
  | 'social'
  | 'educational'
  | 'volunteer'
  | 'sports'
  | 'arts'

export const VALID_CATEGORIES: EventCategory[] = [
  'social', 'educational', 'volunteer', 'sports', 'arts',
]

export const VALID_TIMEFRAMES = ['all', 'this-week', 'this-weekend'] as const
export type Timeframe = (typeof VALID_TIMEFRAMES)[number]

export interface Event {
  id: string
  title: string
  description: string
  location: string
  category: EventCategory
  status: EventStatus
  capacity: number | null
  startDatetime: Date
  endDatetime: Date
  organizerId: string
  createdAt: Date
  updatedAt: Date
}