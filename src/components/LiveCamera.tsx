import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import './LiveCamera.css'

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

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setFailed(true)
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
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
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => { if (blob) onCapture(blob) }, 'image/jpeg', 0.88)
  }

  if (failed) {
    return createPortal(
      <div className="live-camera-overlay live-camera-overlay--fallback">
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
    <div className="live-camera-overlay">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => setReady(true)}
        className="live-camera-video"
      />
      {!ready && (
        <div className="live-camera-loading"><Loader2 size={22} className="live-camera-spin" /></div>
      )}
      <div className="live-camera-controls">
        <button className="live-camera-cancel" onClick={onClose} aria-label="Cancel">
          <X size={22} />
        </button>
        <button className="live-camera-shutter" onClick={capture} disabled={!ready} aria-label="Take photo" />
        <span className="live-camera-spacer" />
      </div>
    </div>,
    document.body
  )
}
