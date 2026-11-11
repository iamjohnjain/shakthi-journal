import { Sparkles, X } from 'lucide-react'
import './WeeklyWrapBanner.css'

export default function WeeklyWrapBanner({ onOpen, onDismiss }: {
  onOpen: () => void
  onDismiss: () => void
}) {
  return (
    <div
      className="wwb-banner"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
    >
      <span className="wwb-icon" aria-hidden="true"><Sparkles size={16} /></span>
      <span className="wwb-text">Your Weekly Wrap is ready</span>
      <button className="wwb-close" aria-label="Dismiss" onClick={e => { e.stopPropagation(); onDismiss() }}>
        <X size={14} />
      </button>
    </div>
  )
}
