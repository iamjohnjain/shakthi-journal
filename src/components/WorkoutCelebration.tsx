import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
import { Download, Share2, Check } from 'lucide-react'
import type { WorkoutSession } from '../db'
import Confetti from './Confetti'
import './WorkoutCelebration.css'

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

interface Props {
  session: WorkoutSession
  onDone: () => void
}

/** The post-save "you did it" moment — a brief confetti burst, then a
    clean, minimal shareable summary card (download or native share).
    Deliberately NOT chaotic: one stat row, a short PR callout, nothing
    the user has to parse. Reads from `session` as saved (its sets'
    `isPR`/`e1rm` were set by annotateExercises() during saveWorkout(),
    so this isn't recomputing PR status independently. */
export default function WorkoutCelebration({ session, onDone }: Props) {
  const [showConfetti, setShowConfetti] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [saved, setSaved] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const sets = session.exercises.flatMap(e => e.sets.filter(s => !s.isWarmup))
  const totalSets = sets.length
  const totalVolume = sets.reduce((v, s) => v + s.weightLbs * s.reps, 0)
  const prExercises = session.exercises.filter(e => e.sets.some(s => s.isPR)).map(e => e.name)

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
      const file = new File([blob], 'workout.png', { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: session.title })
      } else {
        await handleDownload(blob)
      }
    } catch {
      // User cancelled the share sheet, or the browser doesn't support it —
      // either way, falling back to a download keeps this from being a dead end.
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
    a.download = `${session.title.replace(/\s+/g, '-').toLowerCase()}-${session.date}.png`
    a.click()
    URL.revokeObjectURL(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return createPortal(
    <div className="wc-overlay">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

      <div className="wc-sheet">
        <div className="wc-card" ref={cardRef}>
          <div className="wc-card-header">
            <span className="wc-card-title">{session.title}</span>
            <span className="wc-card-date">{formatDate(session.date)}</span>
          </div>

          <div className="wc-card-stats">
            <div className="wc-card-stat">
              <span className="wc-card-stat-val">{formatDuration(session.durationMin)}</span>
              <span className="wc-card-stat-label">Duration</span>
            </div>
            <div className="wc-card-stat">
              <span className="wc-card-stat-val">{totalSets}</span>
              <span className="wc-card-stat-label">Sets</span>
            </div>
            <div className="wc-card-stat">
              <span className="wc-card-stat-val">
                {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume.toLocaleString()}
              </span>
              <span className="wc-card-stat-label">lbs lifted</span>
            </div>
          </div>

          {prExercises.length > 0 && (
            <div className="wc-card-prs">
              <span className="wc-card-prs-label">🏆 New PR</span>
              <span className="wc-card-prs-list">
                {prExercises.slice(0, 3).join(' · ')}
                {prExercises.length > 3 ? ` +${prExercises.length - 3} more` : ''}
              </span>
            </div>
          )}

          <div className="wc-card-brand">Jeevan</div>
        </div>

        <h2 className="wc-headline">Workout complete!</h2>

        <div className="wc-actions">
          <button className="wc-action-btn" onClick={() => handleDownload()} disabled={sharing}>
            {saved ? <><Check size={16} /> Saved</> : <><Download size={16} /> Download</>}
          </button>
          <button className="wc-action-btn wc-action-btn--primary" onClick={handleShare} disabled={sharing}>
            <Share2 size={16} /> Share
          </button>
        </div>

        <button className="wc-done-btn" onClick={onDone}>Done</button>
      </div>
    </div>,
    document.body
  )
}
