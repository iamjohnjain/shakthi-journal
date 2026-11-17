import { useState } from 'react'
import { Sparkles, ChevronRight, BookOpen } from 'lucide-react'
import { CoachStory } from '../components/CoachStory'
import { WeeklyReviewCard, MonthlyReviewCard } from '../components/WeeklyReviewCard'
import CoachChat from '../components/CoachChat'
import { useCoachStory } from '../hooks/useCoachStory'
import { useCurrentWeekReview, useCurrentMonthReview } from '../hooks/useReviews'
import { useApp } from '../context/AppContext'
import './AICoach.css'

type CoachTab = 'chat' | 'catalog'

export default function AICoach() {
  const { mockMode } = useApp()
  const { story, loading: storyLoading }         = useCoachStory(mockMode)
  const { review: weekReview, loading: weekLoad } = useCurrentWeekReview()
  const { review: monthReview }                  = useCurrentMonthReview()
  const [showMonthly, setShowMonthly] = useState(false)
  const [tab, setTab] = useState<CoachTab>('chat')

  return (
    <div className="ai-page">

      {/* Header */}
      <header className="ai-header">
        <div className="ai-header-icon" aria-hidden="true">
          <Sparkles size={22} />
        </div>
        <div>
          <h1 className="ai-title">Coach</h1>
          <p className="ai-subtitle">Powered by your real data</p>
        </div>
      </header>

      {/* Chat / Catalog — same sub-nav pattern as the Workouts tabs */}
      <nav className="ai-subnav">
        <button className={`ai-subnav-item ${tab === 'chat' ? 'ai-subnav-item--active' : ''}`} onClick={() => setTab('chat')}>
          <Sparkles size={15} /><span>Chat</span>
        </button>
        <button className={`ai-subnav-item ${tab === 'catalog' ? 'ai-subnav-item--active' : ''}`} onClick={() => setTab('catalog')}>
          <BookOpen size={15} /><span>Catalog</span>
        </button>
      </nav>

      {tab === 'chat' ? (
        <>
          {/* Today's Story */}
          {!mockMode && (
            <CoachStory story={story} loading={storyLoading} />
          )}

          {/* Weekly Review */}
          {!mockMode && !weekLoad && weekReview && (
            <WeeklyReviewCard review={weekReview} />
          )}

          {/* Monthly Review (toggle) */}
          {!mockMode && monthReview && (
            <>
              {!showMonthly ? (
                <button className="ai-expand-btn" onClick={() => setShowMonthly(true)}>
                  <span>View {monthReview.month} monthly review</span>
                  <ChevronRight size={14} />
                </button>
              ) : (
                <MonthlyReviewCard review={monthReview} />
              )}
            </>
          )}

          <CoachChat />
        </>
      ) : (
        <div className="ai-catalog-soon">
          <BookOpen size={28} />
          <h2>Catalog coming soon</h2>
          <p>Short, research-backed lessons on training, nutrition, and recovery — each one sourced, not guessed. Working on getting this right before it ships.</p>
        </div>
      )}

    </div>
  )
}
