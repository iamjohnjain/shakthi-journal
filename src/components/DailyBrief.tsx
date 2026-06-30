import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { HealthInsight, InsightSeverity, InsightConfidence } from '../engine/healthIntelligence'
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

function confidenceLabel(c: InsightConfidence): string {
  return { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[c]
}

function confidenceClass(c: InsightConfidence): string {
  return { high: 'conf--high', medium: 'conf--medium', low: 'conf--low' }[c]
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: HealthInsight }) {
  const [expanded, setExpanded] = useState(false)

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
            <span className={`insight-confidence ${confidenceClass(insight.confidence)}`}>
              {confidenceLabel(insight.confidence)}
            </span>
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
