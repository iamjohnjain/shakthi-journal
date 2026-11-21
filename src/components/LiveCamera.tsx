import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, SwitchCamera, Timer } from 'lucide-react'
import './LiveCamera.css'

const TIMER_OPTIONS = [0, 3, 10] as const
type TimerOption = typeof TIMER_OPTIONS[number]

/** Full-screen live camera — getUserMedia + a real viewfinder and shutter
    button, not a handoff to the OS camera sheet. Falls back to a plain photo
    picker if getUserMedia is unavailable or permission is denied, so the
    feature still works rather than dead-ending. Shared by every AI-photo
    flow in the app (meals, workouts) — generic in, generic out: hand it a
    `Blob` on capture, it has no opinion about what happens next. */
export default function LiveCamera({ onCapture, onClose }: {
  onCapture: (blob: Blob) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [timerOption, setTimerOption] = useState<TimerOption>(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setFailed(true)
      return
    }
    setReady(false)
    navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [facingMode])

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  function captureNow() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Match the mirrored preview — the front camera's live view is flipped
    // (see .live-camera-video--mirrored) so it behaves like a real mirror
    // while posing, but canvas drawImage() always draws the raw, unflipped
    // decoded frame regardless of CSS transforms on the <video> element.
    // Flipping the saved photo the same way keeps it consistent with what
    // was actually seen on screen, instead of the photo coming out
    // reversed from the live preview.
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => { if (blob) onCapture(blob) }, 'image/jpeg', 0.88)
  }

  function handleShutter() {
    if (timerOption === 0) { captureNow(); return }
    setCountdown(timerOption)
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c == null || c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          captureNow()
          return null
        }
        return c - 1
      })
    }, 1000)
  }

  function cycleTimer() {
    setTimerOption(t => TIMER_OPTIONS[(TIMER_OPTIONS.indexOf(t) + 1) % TIMER_OPTIONS.length])
  }

  if (failed) {
    return createPortal(
      <div className="live-camera-overlay live-camera-overlay--fallback" onClick={e => e.stopPropagation()}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onCapture(f) }} />
        <p className="live-camera-fallback-text">Couldn't access the camera — you can still pick a photo instead.</p>
        <button className="live-camera-choose-btn" onClick={() => fileRef.current?.click()}>Choose Photo</button>
        <button className="live-camera-cancel-link" onClick={onClose}>Cancel</button>
      </div>,
      document.body
    )
  }

  return createPortal(
    // Stops a click here (shutter, cancel) from bubbling through React's
    // component-tree event system to an ancestor's onClick={onClose} — this
    // portals to document.body, but several callers render it as a React
    // child of their own backdrop-click-to-close overlay, which would
    // otherwise also close underneath it on every capture.
    <div className="live-camera-overlay" onClick={e => e.stopPropagation()}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => setReady(true)}
        className={`live-camera-video ${facingMode === 'user' ? 'live-camera-video--mirrored' : ''}`}
      />
      {!ready && (
        <div className="live-camera-loading"><Loader2 size={22} className="live-camera-spin" /></div>
      )}
      {countdown != null && (
        <div className="live-camera-countdown">{countdown}</div>
      )}
      <div className="live-camera-top-controls">
        <button
          className={`live-camera-timer-btn ${timerOption > 0 ? 'live-camera-timer-btn--active' : ''}`}
          onClick={cycleTimer}
          aria-label="Self-timer"
        >
          <Timer size={16} />
          {timerOption > 0 && <span>{timerOption}s</span>}
        </button>
        <button className="live-camera-flip-btn" onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')} aria-label="Switch camera">
          <SwitchCamera size={18} />
        </button>
      </div>
      <div className="live-camera-controls">
        <button className="live-camera-cancel" onClick={onClose} aria-label="Cancel">
          <X size={22} />
        </button>
        <button className="live-camera-shutter" onClick={handleShutter} disabled={!ready || countdown != null} aria-label="Take photo" />
        <span className="live-camera-spacer" />
      </div>
    </div>,
    document.body
  )
}
