import { useState, useEffect, useRef } from 'react'
import { Info, X } from 'lucide-react'
import type { MetricAttribution } from '../db/importEngine'
import './MetricAttribution.css'

function confidenceClass(c: 'high' | 'medium' | 'low'): string {
  return { high: 'attr-conf--high', medium: 'attr-conf--medium', low: 'attr-conf--low' }[c]
}

function dataModeLabel(mode: string): string {
  return { imported: 'Imported', manual: 'Manual entry', live: 'Live sync', mock: 'Mock data' }[mode] ?? mode
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  return `${d} days ago`
}

export function MetricAttributionPopover({ attr }: { attr: MetricAttribution }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="attr-wrap" ref={ref}>
      <button
        className="attr-trigger"
        onClick={() => setOpen(v => !v)}
        aria-label="Data source details"
        title="Data source"
      >
        <Info size={11} />
      </button>

      {open && (
        <div className="attr-popover" role="dialog" aria-label="Metric attribution">
          <div className="attr-header">
            <span className="attr-title">Data source</span>
            <button className="attr-close" onClick={() => setOpen(false)} aria-label="Close">
              <X size={12} />
            </button>
          </div>

          <div className="attr-row">
            <span className="attr-label">Source</span>
            <span className="attr-value">{attr.sourceLabel}</span>
          </div>

          <div className="attr-row">
            <span className="attr-label">Method</span>
            <span className="attr-value">{dataModeLabel(attr.dataMode)}</span>
          </div>

          <div className="attr-row">
            <span className="attr-label">Updated</span>
            <span className="attr-value">{relativeTime(attr.importedAt)}</span>
          </div>

          <div className="attr-row">
            <span className="attr-label">Confidence</span>
            <span className={`attr-conf ${confidenceClass(attr.confidence)}`}>
              {attr.confidence.charAt(0).toUpperCase() + attr.confidence.slice(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
