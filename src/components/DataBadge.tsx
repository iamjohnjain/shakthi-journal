import './DataBadge.css'

export type DataBadgeMode = 'mock' | 'imported' | 'live' | 'local' | 'manual'

interface DataBadgeProps {
  mode: DataBadgeMode
  source?: string
  updatedAt?: string
  size?: 'sm' | 'md'
}

const LABELS: Record<DataBadgeMode, string> = {
  mock:     'MOCK DATA',
  imported: 'IMPORTED',
  live:     'LIVE API',
  local:    'LOCAL',
  manual:   'MANUAL',
}

export default function DataBadge({ mode, source, updatedAt, size = 'sm' }: DataBadgeProps) {
  return (
    <span className={`data-badge data-badge--${mode} data-badge--${size}`} title={
      source ? `Source: ${source}${updatedAt ? ` · ${updatedAt}` : ''}` : undefined
    }>
      <span className="data-badge-dot" />
      {LABELS[mode]}
      {source && <span className="data-badge-source"> · {source}</span>}
    </span>
  )
}

/** Full-width banner shown at top of pages when in mock mode */
export function MockModeBanner({ onGoToSettings }: { onGoToSettings?: () => void }) {
  return (
    <div className="mock-mode-banner">
      <span className="mock-mode-banner-dot" />
      <span className="mock-mode-banner-text">
        <strong>MOCK DATA MODE</strong> — Showing simulated data. No real health sources are connected.
      </span>
      {onGoToSettings && (
        <button className="mock-mode-banner-btn" onClick={onGoToSettings}>
          Connect sources
        </button>
      )}
    </div>
  )
}
