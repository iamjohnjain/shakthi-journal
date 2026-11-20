import { useRef, useState, useEffect } from 'react'
import { Check, X, ZoomIn, ZoomOut } from 'lucide-react'
import './PhotoCropEditor.css'

const FRAME_W = 300
const FRAME_H = 400
const OUTPUT_W = 900
const OUTPUT_H = 1200
const MIN_SCALE = 1
const MAX_SCALE = 4

/** A real pan/zoom/crop editor for a check-in photo — some phone photos
    come in framed badly (off-center, too zoomed out) with no way to fix
    that today beyond re-taking the shot. Drag to reposition, pinch (or the
    +/- buttons) to zoom, "Save" re-renders exactly what's visible in the
    frame onto a fixed-size canvas and hands back a new data URL — the
    caller is responsible for actually persisting it. */
export default function PhotoCropEditor({ photoDataUrl, onCancel, onSave }: {
  photoDataUrl: string
  onCancel: () => void
  onSave: (newDataUrl: string) => Promise<void> | void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const naturalSize = useRef({ w: 1, h: 1 })
  const [loaded, setLoaded] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)

  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const offsetStart = useRef({ x: 0, y: 0 })
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      naturalSize.current = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 }
      setLoaded(true)
    }
    img.src = photoDataUrl
  }, [photoDataUrl])

  function baseScale() {
    const { w, h } = naturalSize.current
    return Math.max(FRAME_W / w, FRAME_H / h)
  }

  function clampOffset(x: number, y: number, s: number) {
    const dispScale = baseScale() * s
    const dispW = naturalSize.current.w * dispScale
    const dispH = naturalSize.current.h * dispScale
    const maxX = Math.max(0, (dispW - FRAME_W) / 2)
    const maxY = Math.max(0, (dispH - FRAME_H) / 2)
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
  }

  function touchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchStart.current = { dist: touchDist(e.touches), scale }
      dragStart.current = null
    } else if (e.touches.length === 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      offsetStart.current = offset
      pinchStart.current = null
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStart.current) {
      const dist = touchDist(e.touches)
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStart.current.scale * (dist / pinchStart.current.dist)))
      setScale(nextScale)
      setOffset(o => clampOffset(o.x, o.y, nextScale))
    } else if (e.touches.length === 1 && dragStart.current) {
      const dx = e.touches[0].clientX - dragStart.current.x
      const dy = e.touches[0].clientY - dragStart.current.y
      setOffset(clampOffset(offsetStart.current.x + dx, offsetStart.current.y + dy, scale))
    }
  }

  function onTouchEnd() {
    dragStart.current = null
    pinchStart.current = null
  }

  function adjustZoom(delta: number) {
    setScale(s => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta))
      setOffset(o => clampOffset(o.x, o.y, next))
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Could not load image'))
        img.src = photoDataUrl
      })
      const dispScale = baseScale() * scale
      const dispW = naturalSize.current.w * dispScale
      const dispH = naturalSize.current.h * dispScale
      const imgLeft = FRAME_W / 2 - dispW / 2 + offset.x
      const imgTop = FRAME_H / 2 - dispH / 2 + offset.y
      const srcX = -imgLeft / dispScale
      const srcY = -imgTop / dispScale
      const srcW = FRAME_W / dispScale
      const srcH = FRAME_H / dispScale

      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_W
      canvas.height = OUTPUT_H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No canvas context')
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_W, OUTPUT_H)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      await onSave(dataUrl)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pce-overlay" onClick={onCancel}>
      <div className="pce-panel" onClick={e => e.stopPropagation()}>
        <div className="pce-header">
          <span>Reposition &amp; Crop</span>
          <button className="pce-close" onClick={onCancel} aria-label="Cancel"><X size={18} /></button>
        </div>

        <div
          className="pce-frame"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {loaded && (
            <img
              ref={imgRef}
              src={photoDataUrl}
              alt=""
              className="pce-img"
              style={{
                width: naturalSize.current.w * baseScale() * scale,
                height: naturalSize.current.h * baseScale() * scale,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
              draggable={false}
            />
          )}
        </div>

        <div className="pce-zoom-row">
          <button className="pce-zoom-btn" onClick={() => adjustZoom(-0.25)} aria-label="Zoom out"><ZoomOut size={16} /></button>
          <input
            type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.01} value={scale}
            onChange={e => {
              const next = Number(e.target.value)
              setScale(next)
              setOffset(o => clampOffset(o.x, o.y, next))
            }}
          />
          <button className="pce-zoom-btn" onClick={() => adjustZoom(0.25)} aria-label="Zoom in"><ZoomIn size={16} /></button>
        </div>

        <p className="pce-hint">Drag to reposition · Pinch or use +/- to zoom</p>

        <div className="pce-actions">
          <button className="pce-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="pce-save" onClick={() => void handleSave()} disabled={saving || !loaded}>
            {saving ? 'Saving…' : <><Check size={15} /> Save</>}
          </button>
        </div>
      </div>
    </div>
  )
}
