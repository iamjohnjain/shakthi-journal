import { useState } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'
import { CoachStory } from '../components/CoachStory'
import { WeeklyReviewCard, MonthlyReviewCard } from '../components/WeeklyReviewCard'
import { AchievementRow } from '../components/AchievementCard'
import { useCoachStory } from '../hooks/useCoachStory'
import { useCurrentWeekReview, useCurrentMonthReview } from '../hooks/useReviews'
import { useRecentAchievements } from '../hooks/useAchievements'
import { useApp } from '../context/AppContext'
import './AICoach.css'

export default function AICoach() {
  const { mockMode } = useApp()
  const { story, loading: storyLoading }         = useCoachStory(mockMode)
  const { review: weekReview, loading: weekLoad } = useCurrentWeekReview()
  const { review: monthReview }                  = useCurrentMonthReview()
  const { achievements }                         = useRecentAchievements(30)
  const [showMonthly, setShowMonthly] = useState(false)

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

      {/* Today's Story */}
      {!mockMode && (
        <CoachStory story={story} loading={storyLoading} />
      )}

      {/* Recent Achievements */}
      {!mockMode && achievements.length > 0 && (
        <AchievementRow achievements={achievements} />
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

      {/* AI Q&A — coming soon */}
      <div className="ai-coming-soon-card">
        <div className="ai-coming-soon-icon" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div className="ai-coming-soon-text">
          <strong>AI Q&amp;A coming soon</strong>
          <p>Ask questions about your training, nutrition, and recovery — answered by a model that reads your actual health data. Your story, reviews, and achievements above are already live.</p>
        </div>
      </div>

    </div>
  )
}
