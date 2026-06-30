import { Sparkles } from 'lucide-react'
import type { TodaysStory } from '../engine/storyEngine'
import './CoachStory.css'

const CONFIDENCE_LABEL: Record<string, string> = {
  high:   'High confidence',
  medium: 'Medium confidence',
  low:    'Low confidence',
}

const CONFIDENCE_CLASS: Record<string, string> = {
  high:   'story-conf--high',
  medium: 'story-conf--medium',
  low:    'story-conf--low',
}

interface CoachStoryProps {
  story: TodaysStory
  loading: boolean
}

export function CoachStory({ story, loading }: CoachStoryProps) {
  if (loading) {
    return (
      <div className="coach-story coach-story--loading" aria-label="Loading today's story">
        <div className="story-skeleton story-skeleton--title" />
        <div className="story-skeleton" />
        <div className="story-skeleton story-skeleton--short" />
      </div>
    )
  }

  if (!story.text) return null

  return (
    <article className="coach-story" aria-label="Today's story">
      <header className="story-header">
        <span className="story-header-icon" aria-hidden="true">
          <Sparkles size={13} />
        </span>
        <span className="story-header-label">TODAY'S STORY</span>
        <span className={`story-conf ${CONFIDENCE_CLASS[story.confidence]}`}>
          {CONFIDENCE_LABEL[story.confidence]}
        </span>
      </header>

      <p className="story-text">{story.text}</p>

      {story.dataUsed.length > 0 && (
        <footer className="story-sources">
          {story.dataUsed.map(src => (
            <span key={src} className="story-source-chip">{src}</span>
          ))}
        </footer>
      )}
    </article>
  )
}
