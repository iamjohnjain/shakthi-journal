import { useState } from 'react'
import { ChevronDown, ChevronUp, Dumbbell, Moon, Utensils, Scale } from 'lucide-react'
import type { WeeklyReview, MonthlyReview } from '../db/index'
import './WeeklyReviewCard.css'

// ─── Shared helpers ────────────────────────────────────────────────────────────

function ConfidenceBadge({ c }: { c: 'high' | 'medium' | 'low' }) {
  const labels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }
  const cls    = { high: 'rev-conf--high', medium: 'rev-conf--medium', low: 'rev-conf--low' }
  return <span className={`rev-conf ${cls[c]}`}>{labels[c]}</span>
}

function StatRow({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | null; color?: string
}) {
  if (!value) return null
  return (
    <div className="rev-stat">
      <span className="rev-stat-icon" style={{ color: color ?? 'var(--text-tertiary)' }} aria-hidden="true">
        <Icon size={13} />
      </span>
      <span className="rev-stat-label">{label}</span>
      <span className="rev-stat-value">{value}</span>
    </div>
  )
}

function ConsistencyBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rev-bar-row">
      <span className="rev-bar-label">{label}</span>
      <div className="rev-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="rev-bar-fill"
          style={{
            width: `${pct}%`,
            background: pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--orange)',
          }}
        />
      </div>
      <span className="rev-bar-pct">{pct}%</span>
    </div>
  )
}

// ─── Weekly Card ───────────────────────────────────────────────────────────────

export function WeeklyReviewCard({ review }: { review: WeeklyReview }) {
  const [expanded, setExpanded] = useState(false)

  const weightStr = review.stats.weightChangeLbs !== null
    ? `${review.stats.weightChangeLbs > 0 ? '+' : ''}${review.stats.weightChangeLbs} lbs`
    : null

  return (
    <article className="review-card" aria-label="Weekly review">
      <button
        className="review-card-header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <div className="rev-header-left">
          <span className="rev-pill">THIS WEEK</span>
          <span className="rev-date-range">
            {formatDate(review.weekStart)} – {formatDate(review.weekEnd)}
          </span>
        </div>
        <div className="rev-header-right">
          <ConfidenceBadge c={review.confidence} />
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {/* Always-visible summary */}
      <div className="review-card-summary">
        <p className="rev-summary-text">{review.summary}</p>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="review-card-detail">
          {/* Consistency bars */}
          <div className="rev-consistency">
            <h3 className="rev-section-title">Consistency</h3>
            <ConsistencyBar label="Training"  pct={review.workoutConsistencyPct} />
            <ConsistencyBar label="Nutrition" pct={review.nutritionConsistencyPct} />
            {review.recoveryConsistencyPct > 0 && (
              <ConsistencyBar label="Recovery data" pct={review.recoveryConsistencyPct} />
            )}
          </div>

          {/* Stats */}
          <div className="rev-stats">
            <StatRow icon={Dumbbell} label="Workouts" color="var(--blue)"   value={review.stats.workoutCount > 0 ? `${review.stats.workoutCount}` : 'None'} />
            <StatRow icon={Moon}     label="Avg sleep" color="var(--purple)" value={review.stats.avgSleepHours !== null ? `${review.stats.avgSleepHours}h` : null} />
            <StatRow icon={Utensils} label="Avg protein" color="var(--green)" value={review.stats.avgProteinG !== null ? `${review.stats.avgProteinG}g` : null} />
            <StatRow icon={Scale}    label="Weight change" color="var(--orange)" value={weightStr} />
          </div>

          {/* Win / challenge */}
          {(review.biggestWin || review.biggestChallenge) && (
            <div className="rev-highlights">
              {review.biggestWin && (
                <div className="rev-highlight rev-highlight--win">
                  <span className="rev-highlight-label">Win</span>
                  <span className="rev-highlight-text">{review.biggestWin}</span>
                </div>
              )}
              {review.biggestChallenge && (
                <div className="rev-highlight rev-highlight--challenge">
                  <span className="rev-highlight-label">Challenge</span>
                  <span className="rev-highlight-text">{review.biggestChallenge}</span>
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {review.recommendations.length > 0 && (
            <div className="rev-recommendations">
              <h3 className="rev-section-title">Next Week</h3>
              {review.recommendations.map((r, i) => (
                <div key={i} className="rev-recommendation">
                  <span className="rev-rec-bullet" aria-hidden="true">→</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Monthly Card ──────────────────────────────────────────────────────────────

export function MonthlyReviewCard({ review }: { review: MonthlyReview }) {
  const [expanded, setExpanded] = useState(false)

  const weightStr = review.stats.weightChangeLbs !== null
    ? `${review.stats.weightChangeLbs > 0 ? '+' : ''}${review.stats.weightChangeLbs} lbs`
    : null

  return (
    <article className="review-card review-card--monthly" aria-label="Monthly review">
      <button
        className="review-card-header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <div className="rev-header-left">
          <span className="rev-pill rev-pill--monthly">THIS MONTH</span>
          <span className="rev-date-range">{formatMonth(review.month)}</span>
        </div>
        <div className="rev-header-right">
          <ConfidenceBadge c={review.confidence} />
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      <div className="review-card-summary">
        <p className="rev-summary-text">{review.summary}</p>
      </div>

      {expanded && (
        <div className="review-card-detail">
          <div className="rev-stats">
            <StatRow icon={Dumbbell} label="Workouts"     color="var(--blue)"   value={review.stats.workoutCount > 0 ? `${review.stats.workoutCount}` : 'None'} />
            <StatRow icon={Moon}     label="Avg sleep"    color="var(--purple)" value={review.stats.avgSleepHours !== null ? `${review.stats.avgSleepHours}h` : null} />
            <StatRow icon={Utensils} label="Avg protein"  color="var(--green)"  value={review.stats.avgProteinG !== null ? `${review.stats.avgProteinG}g` : null} />
            <StatRow icon={Scale}    label="Weight Δ"     color="var(--orange)" value={weightStr} />
          </div>

          {/* Consistency score */}
          <div className="rev-consistency-score">
            <span className="rev-section-title">Consistency Score</span>
            <span className="rev-score-val" style={{
              color: review.consistencyScore >= 70 ? 'var(--green)' : review.consistencyScore >= 40 ? 'var(--yellow)' : 'var(--orange)',
            }}>
              {review.consistencyScore}
            </span>
            <span className="rev-score-max">/100</span>
          </div>

          {/* Milestones */}
          {review.milestones.length > 0 && (
            <div className="rev-milestones">
              <h3 className="rev-section-title">Milestones</h3>
              {review.milestones.map((m, i) => (
                <div key={i} className="rev-milestone">🏅 {m}</div>
              ))}
            </div>
          )}

          {review.stats.bestLiftPR && (
            <div className="rev-pr">
              <span className="rev-pr-label">Best PR this month</span>
              <span className="rev-pr-val">
                {review.stats.bestLiftPR.exercise} · {review.stats.bestLiftPR.weightLbs} lbs (e1RM)
              </span>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMonth(m: string): string {
  return new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
