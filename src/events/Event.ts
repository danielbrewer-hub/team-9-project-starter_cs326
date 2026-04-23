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