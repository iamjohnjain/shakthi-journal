import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import type { HealthInsight, InsightSeverity, InsightCategory } from '../engine/healthIntelligence'
import './DailyBrief.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityClass(s: InsightSeverity): string {
  return {
    positive: 'insight--positive',
    action:   'insight--action',
    warning:  'insight--warning',
    info:     'insight--info',
  }[s]
}

// Where "do something about this" actually happens for each insight category.
// 'activity' has no dedicated page of its own — steps/calories already live on
// this same Dashboard — so it gets no link rather than a pointless self-link.
const CATEGORY_LINK: Partial<Record<InsightCategory, { path: string; label: string }>> = {
  recovery:  { path: '/recovery',           label: 'View Recovery' },
  nutrition: { path: '/nutrition',          label: 'Log a meal' },
  hydration: { path: '/nutrition',          label: 'Log water' },
  training:  { path: '/workouts',           label: 'Log a workout' },
  weight:    { path: '/log',                label: 'Log weight' },
  setup:     { path: '/connected-accounts', label: 'Connect a source' },
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: HealthInsight }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const link = CATEGORY_LINK[insight.category]

  return (
    <div className={`insight-card ${severityClass(insight.severity)}`}>
      <button
        className="insight-header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className="insight-emoji" aria-hidden="true">{insight.emoji}</span>
        <span className="insight-title">{insight.title}</span>
        <span className="insight-chevron" aria-hidden="true">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {expanded && (
        <div className="insight-body">
          <div className="insight-section">
            <span className="insight-label">What the data shows</span>
            <p className="insight-text">{insight.observation}</p>
          </div>
          <div className="insight-section">
            <span className="insight-label">Why it matters</span>
            <p className="insight-text">{insight.whyItMatters}</p>
          </div>
          <div className="insight-section">
            <span className="insight-label">What to do</span>
            <p className="insight-text insight-action">{insight.action}</p>
          </div>
          <div className="insight-footer">
            {insight.dataSources.length > 0 && (
              <div className="insight-sources">
                {insight.dataSources.map(src => (
                  <span key={src} className="insight-source-badge">{src}</span>
                ))}
              </div>
            )}
            {insight.missingData && insight.missingData.length > 0 && (
              <div className="insight-missing">
                Missing: {insight.missingData.join(', ')}
              </div>
            )}
          </div>

          {link && (
            <button className="insight-link-btn" onClick={() => navigate(link.path)}>
              {link.label} <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Daily Brief ──────────────────────────────────────────────────────────────

interface DailyBriefProps {
  insights: HealthInsight[]
  loading: boolean
}

export function DailyBrief({ insights, loading }: DailyBriefProps) {
  const [showAll, setShowAll] = useState(false)

  if (loading) {
    return (
      <div className="daily-brief daily-brief--loading">
        <div className="brief-skeleton" />
        <div className="brief-skeleton brief-skeleton--short" />
        <div className="brief-skeleton" />
      </div>
    )
  }

  if (insights.length === 0) return null

  const top = insights.slice(0, 4)
  const rest = insights.slice(4)
  const visible = showAll ? insights : top

  return (
    <section className="daily-brief" aria-label="Daily insights">
      <div className="brief-bullets">
        {top.map(insight => (
          <div key={insight.id} className="brief-bullet">
            <span className="brief-bullet-emoji" aria-hidden="true">{insight.emoji}</span>
            <span className="brief-bullet-text">{insight.title}</span>
          </div>
        ))}
      </div>

      <div className="brief-cards">
        {visible.map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>

      {rest.length > 0 && (
        <button
          className="brief-show-more"
          onClick={() => setShowAll(s => !s)}
        >
          {showAll
            ? `Show less`
            : `${rest.length} more insight${rest.length > 1 ? 's' : ''}`}
          {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      )}
    </section>
  )
}
