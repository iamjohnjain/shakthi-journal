// Timeline event interfaces — prepared for future Timeline view.
// These define the contract between data stores and Timeline rendering.
// The Timeline UI is NOT implemented here.

export type TimelineEventType =
  | 'workout'
  | 'nutrition_day'
  | 'weight_measurement'
  | 'achievement'
  | 'weekly_review'
  | 'monthly_review'
  | 'coach_insight'
  | 'import_batch'
  | 'goal_change'
  | 'profile_update'

export type TimelineEventImportance = 'high' | 'medium' | 'low'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  date: string                    // YYYY-MM-DD (primary sort key)
  timestamp: string               // ISO for tie-breaking
  title: string
  body?: string
  emoji?: string
  importance: TimelineEventImportance
  metadata?: Record<string, unknown>
}

// Stores that want to appear in the Timeline implement this interface.
export interface TimelineEventSource {
  toTimelineEvent(): TimelineEvent
}
