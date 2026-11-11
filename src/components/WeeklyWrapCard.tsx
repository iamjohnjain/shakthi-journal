import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
import { Download, Share2, Check } from 'lucide-react'
import type { WeeklyReview } from '../db'
import './WeeklyWrapCard.css'

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${sStr} – ${eStr}`
}

interface Stat { val: string; label: string }

function buildStats(review: WeeklyReview): Stat[] {
  const stats: Stat[] = []
  stats.push({ val: `${review.stats.workoutCount}`, label: 'Workouts' })
  if (review.stats.avgSleepHours !== null) {
    stats.push({ val: `${review.stats.avgSleepHours}h`, label: 'Avg sleep' })
  } else if (review.stats.avgProteinG !== null) {
    stats.push({ val: `${review.stats.avgProteinG}g`, label: 'Avg protein' })
  }
  if (review.stats.weightChangeLbs !== null) {
    const v = review.stats.weightChangeLbs
    stats.push({ val: `${v > 0 ? '+' : ''}${v} lbs`, label: 'Weight Δ' })
  } else if (review.stats.avgProteinG !== null && stats.length < 3) {
    stats.push({ val: `${review.stats.avgProteinG}g`, label: 'Avg protein' })
  }
  return stats.slice(0, 3)
}

interface Props {
  review: WeeklyReview
  onDone: () => void
}

export default function WeeklyWrapCard({ review, onDone }: Props) {
  const [sharing, setSharing] = useState(false)
  const [saved, setSaved] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const stats = buildStats(review)
  const focus = review.recommendations[0] ?? null

  async function captureCard(): Promise<Blob | null> {
    if (!cardRef.current) return null
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 })
    const res = await fetch(dataUrl)
    return res.blob()
  }

  async function handleShare() {
    setSharing(true)
    try {
      const blob = await captureCard()
      if (!blob) return
      const file = new File([blob], 'weekly-wrap.png', { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Weekly Wrap' })
      } else {
        await handleDownload(blob)
      }
    } catch {
      await handleDownload()
    } finally {
      setSharing(false)
    }
  }

  async function handleDownload(preBlob?: Blob) {
    const blob = preBlob ?? await captureCard()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `weekly-wrap-${review.weekStart}.png`
    a.click()
    URL.revokeObjectURL(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return createPortal(
    <div className="ww-overlay">
      <div className="ww-sheet">
        <div className="ww-card" ref={cardRef}>
          <div className="ww-card-header">
            <span className="ww-card-title">Weekly Wrap</span>
            <span className="ww-card-date">{formatRange(review.weekStart, review.weekEnd)}</span>
          </div>

          {stats.length > 0 && (
            <div className="ww-card-stats">
              {stats.map(s => (
                <div className="ww-card-stat" key={s.label}>
                  <span className="ww-card-stat-val">{s.val}</span>
                  <span className="ww-card-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {review.biggestWin && (
            <div className="ww-card-win">
              <span className="ww-card-win-label">🎉 Win</span>
              <span className="ww-card-win-text">{review.biggestWin}</span>
            </div>
          )}

          {focus && (
            <div className="ww-card-focus">
              <span className="ww-card-focus-label">Focus for next week</span>
              <span className="ww-card-focus-text">{focus}</span>
            </div>
          )}

          <div className="ww-card-brand">Jeevan</div>
        </div>

        <h2 className="ww-headline">{review.summary}</h2>

        <div className="ww-actions">
          <button className="ww-action-btn" onClick={() => handleDownload()} disabled={sharing}>
            {saved ? <><Check size={16} /> Saved</> : <><Download size={16} /> Download</>}
          </button>
          <button className="ww-action-btn ww-action-btn--primary" onClick={handleShare} disabled={sharing}>
            <Share2 size={16} /> Share
          </button>
        </div>
        <button className="ww-done-btn" onClick={onDone}>Done</button>
      </div>
    </div>,
    document.body
  )
}
