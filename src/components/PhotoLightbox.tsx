import { useState, useEffect, useCallback, useRef } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { X, Pencil, Check, Trash2, Download, Crop } from 'lucide-react'
import { useVerticalPeekSwipe } from '../hooks/useVerticalPeekSwipe'
import PhotoCropEditor from './PhotoCropEditor'
import './PhotoLightbox.css'

export interface LightboxEntry {
  photoId?: string
  photoDataUrl: string
  caption: string
  meta?: string
  date?: string
  weightLbs?: number | null
}

interface EditValues {
  date: string
  weightLbs: string
}

type Pane = 'primary' | 'secondary'

/** One pane of the lightbox — owns its own same-date photo list and swipes
    vertically through it (not left/right, and not across dates: comparing
    just two dates doesn't need cross-date paging, only "show me the other
    shots from this same day"). Reports whichever photo is currently on
    screen up to the parent via `onActiveChange`, since the shared Edit/
    Download/Delete row below both panes acts on whichever one is selected. */
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const DATE_SWIPE_THRESHOLD = 60

function touchDist(touches: ReactTouchEvent['touches']) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function LightboxPane({ photos, initialIndex, pane, selectable, selected, onSelect, onActiveChange, onSwipeDate }: {
  photos: (LightboxEntry | null)[]
  initialIndex: number
  pane: Pane
  selectable: boolean
  selected: boolean
  onSelect: () => void
  onActiveChange: (pane: Pane, entry: LightboxEntry | null) => void
  /** Only wired up for the single-photo (non-Compare) viewer — swiping
      left/right there moves to the adjacent CHECK-IN DATE entirely (a
      fresh `photos` list from the parent), distinct from this pane's own
      vertical swipe through the same date's other poses. Compare mode
      omits this — paging across dates doesn't make sense when you've
      deliberately picked two specific dates to look at side by side. */
  onSwipeDate?: (direction: 'prev' | 'next') => void
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, photos.length - 1)))
  const peek = useVerticalPeekSwipe({ index, count: photos.length, onChange: setIndex })

  // Pinch-to-zoom — resets whenever the displayed photo changes (paging
  // either vertically or across dates) so zooming into one photo never
  // carries over and leaves the next one looking cropped by accident.
  const [zoomScale, setZoomScale] = useState(1)
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 })
  useEffect(() => { setZoomScale(1); setZoomOffset({ x: 0, y: 0 }) }, [index, photos])

  // One ref-tracked gesture state machine instead of separate hooks for
  // pinch/pan/horizontal — all four gestures (pinch-zoom, pan-while-
  // zoomed, vertical same-day swipe, horizontal date-swipe) share the same
  // touch surface and have to be disambiguated from the same raw events:
  // touch count picks pinch vs. one-finger, current zoom picks pan vs.
  // paging, and for paging, whichever axis the drag clears a small
  // deadzone in first wins (so a slightly-diagonal vertical swipe doesn't
  // get mistaken for a date change, and vice versa).
  const gesture = useRef<{
    mode: 'undecided' | 'pinch' | 'pan' | 'vertical' | 'horizontal'
    startX: number; startY: number
    pinchDist: number; pinchStartScale: number
    panStart: { x: number; y: number }
    horizDX: number
  }>({ mode: 'undecided', startX: 0, startY: 0, pinchDist: 0, pinchStartScale: 1, panStart: { x: 0, y: 0 }, horizDX: 0 })
  const [dragX, setDragX] = useState(0)

  function onTouchStart(e: ReactTouchEvent) {
    const g = gesture.current
    if (e.touches.length === 2) {
      g.mode = 'pinch'
      g.pinchDist = touchDist(e.touches)
      g.pinchStartScale = zoomScale
      return
    }
    if (zoomScale > 1) {
      g.mode = 'pan'
      g.panStart = { x: e.touches[0].clientX - zoomOffset.x, y: e.touches[0].clientY - zoomOffset.y }
      return
    }
    g.mode = 'undecided'
    g.startX = e.touches[0].clientX
    g.startY = e.touches[0].clientY
    g.horizDX = 0
    peek.handlers.onTouchStart(e)
  }

  function onTouchMove(e: ReactTouchEvent) {
    const g = gesture.current
    if (g.mode === 'pinch' && e.touches.length === 2) {
      const dist = touchDist(e.touches)
      setZoomScale(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, g.pinchStartScale * (dist / g.pinchDist))))
      return
    }
    if (g.mode === 'pan') {
      setZoomOffset({ x: e.touches[0].clientX - g.panStart.x, y: e.touches[0].clientY - g.panStart.y })
      return
    }
    if (g.mode === 'undecided') {
      const dx = e.touches[0].clientX - g.startX
      const dy = e.touches[0].clientY - g.startY
      if (onSwipeDate && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        g.mode = 'horizontal'
      } else if (Math.abs(dy) > 10) {
        g.mode = 'vertical'
      }
    }
    if (g.mode === 'horizontal') {
      g.horizDX = e.touches[0].clientX - g.startX
      setDragX(g.horizDX * 0.4)
      return
    }
    if (g.mode === 'vertical') peek.handlers.onTouchMove(e)
  }

  function onTouchEnd() {
    const g = gesture.current
    if (g.mode === 'horizontal') {
      if (Math.abs(g.horizDX) > DATE_SWIPE_THRESHOLD) onSwipeDate?.(g.horizDX < 0 ? 'next' : 'prev')
      setDragX(0)
    } else {
      peek.handlers.onTouchEnd()
    }
    g.mode = 'undecided'
  }

  const current = photos[index] ?? null
  const prev = index > 0 ? photos[index - 1] : null
  const next = index < photos.length - 1 ? photos[index + 1] : null

  useEffect(() => { onActiveChange(pane, current) }, [pane, current, onActiveChange])

  return (
    <div
      className={`lightbox-pane ${selectable ? 'lightbox-pane--split' : ''} ${selected ? 'lightbox-pane--selected' : ''}`}
      onClick={e => { e.stopPropagation(); if (selectable) onSelect() }}
    >
      <div
        ref={peek.containerRef}
        className="lightbox-pane-viewport"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="lightbox-pane-track"
          style={{
            transform: `translateY(calc(-33.3333% + ${peek.dragY}px)) translateX(${dragX}px)`,
            transition: peek.animating ? 'transform 0.26s cubic-bezier(.2,.8,.2,1)' : dragX === 0 ? 'transform 0.2s ease' : 'none',
          }}
        >
          <div className="lightbox-peek-slot">
            {prev && <img src={prev.photoDataUrl} alt="" className="lightbox-img lightbox-peek-img" />}
          </div>
          <div className="lightbox-peek-slot lightbox-peek-slot--current">
            {current ? (
              // The pinch-zoom transform lives on this plain wrapper div,
              // not the motion.img itself — that element's transform is
              // owned by Motion's layout-projection system (the shared
              // layoutId morph below), and a manually-set style.transform
              // on the same element would fight it. Separating the two
              // concerns onto two elements avoids that conflict entirely.
              <div
                className="lightbox-zoom-wrap"
                style={{
                  transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
                  transition: gesture.current.mode === 'pinch' || gesture.current.mode === 'pan' ? 'none' : 'transform 0.2s ease',
                }}
              >
                <motion.img
                  src={current.photoDataUrl}
                  alt=""
                  className="lightbox-img"
                  // Matches the layoutId the grid thumbnail this photo came
                  // from used (ProgressCheckIns.tsx) — when they match, Motion
                  // morphs the thumbnail's actual screen position/size into
                  // this full-screen one instead of a plain fade/cut. Falls
                  // back to a harmless normal mount for any photo not opened
                  // from a layoutId'd thumbnail (e.g. a not-yet-saved staged
                  // photo with no photoId, or a photo reached via swipe
                  // rather than a fresh tap on its own grid tile).
                  layoutId={current.photoId ? `ckin-photo-${current.photoId}` : undefined}
                />
              </div>
            ) : <div className="lightbox-pane-empty">No photo</div>}
          </div>
          <div className="lightbox-peek-slot">
            {next && <img src={next.photoDataUrl} alt="" className="lightbox-img lightbox-peek-img" />}
          </div>
        </div>
      </div>
      {photos.length > 1 && <div className="lightbox-peek-count">{index + 1} / {photos.length}</div>}
    </div>
  )
}

/** Full-screen photo viewer — same portal pattern as LiveCamera.

    `primary`/`secondary` are each a pane's full same-date photo set (every
    shot from that day, already filtered to the active pose filter by the
    caller — "same tag" vs. "All" is just whichever list got built).
    `secondary`, when given, renders side-by-side with `primary` — Compare
    mode's two-dates-at-once view — each pane paging independently via its
    own vertical swipe, not moving in lockstep.

    `onSave`/`onDelete`/`onSavePhoto` opt into the inline edit form / delete
    confirm / crop editor for whichever pane is currently selected (tap a
    pane to select it when both are present) — all only meaningful for an
    already-saved photo, so a caller viewing a not-yet-saved staged photo
    simply omits them. */
export default function PhotoLightbox({
  primary, secondary, primaryInitialIndex = 0, secondaryInitialIndex = 0, onClose, onSave, onDelete, onSavePhoto, onSwipeDate,
}: {
  primary: (LightboxEntry | null)[]
  secondary?: (LightboxEntry | null)[]
  primaryInitialIndex?: number
  secondaryInitialIndex?: number
  onClose: () => void
  onSave?: (pane: Pane, photoId: string, changes: { date: string; weightLbs: number | null }) => Promise<void> | void
  onDelete?: (pane: Pane, photoId: string) => Promise<void> | void
  onSavePhoto?: (pane: Pane, photoId: string, newDataUrl: string) => Promise<void> | void
  /** Single-photo viewer only (never passed in Compare's side-by-side
      mode) — horizontal swipe moves to the adjacent check-in DATE
      entirely, a fresh photo list the caller builds and re-opens the
      lightbox with. */
  onSwipeDate?: (direction: 'prev' | 'next') => void
}) {
  const [selectedPane, setSelectedPane] = useState<Pane>('primary')
  const [activeEntries, setActiveEntries] = useState<{ primary: LightboxEntry | null; secondary: LightboxEntry | null }>({
    primary: primary[Math.max(0, Math.min(primaryInitialIndex, primary.length - 1))] ?? null,
    secondary: secondary ? secondary[Math.max(0, Math.min(secondaryInitialIndex, secondary.length - 1))] ?? null : null,
  })
  const [editing, setEditing] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sideBySide = !!secondary
  const activeEntry = sideBySide && selectedPane === 'secondary' ? activeEntries.secondary : activeEntries.primary

  const handleActiveChange = useCallback((pane: Pane, entry: LightboxEntry | null) => {
    setActiveEntries(cur => ({ ...cur, [pane]: entry }))
  }, [])

  const [values, setValues] = useState<EditValues>({ date: '', weightLbs: '' })

  function openEdit() {
    setValues({
      date: activeEntry?.date ?? '',
      weightLbs: activeEntry?.weightLbs != null ? String(activeEntry.weightLbs) : '',
    })
    setEditing(true)
  }

  async function handleSave() {
    if (!onSave || !activeEntry?.photoId || !values.date) return
    setSaving(true)
    try {
      const weightLbs = values.weightLbs.trim() ? Number(values.weightLbs) : null
      await onSave(selectedPane, activeEntry.photoId, { date: values.date, weightLbs: weightLbs != null && !Number.isNaN(weightLbs) ? weightLbs : null })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCrop(newDataUrl: string) {
    if (!onSavePhoto || !activeEntry?.photoId) return
    await onSavePhoto(selectedPane, activeEntry.photoId, newDataUrl)
    setCropping(false)
  }

  // iOS Safari/WKWebView (this app's native wrapper) doesn't reliably honor
  // `download` on a plain `data:` URI anchor at all — tapping it silently
  // did nothing, which is exactly the bug reported. The fix proven
  // elsewhere in this app (WorkoutCelebration's own download/share) is to
  // hand the browser a real Blob instead: the native share sheet (with its
  // own "Save Image" action) works reliably via navigator.share() with a
  // File, and a Blob object URL is a far more reliably downloadable target
  // than a raw data URI for the desktop fallback.
  async function handleDownload(entry: LightboxEntry) {
    const filename = `jeevan-checkin-${entry.date ?? new Date().toISOString().slice(0, 10)}.jpg`
    const blob = await fetch(entry.photoDataUrl).then(r => r.blob())
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return
      } catch {
        // User cancelled the share sheet, or share failed — fall through
        // to the plain download link rather than leaving this a dead end.
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleDelete() {
    if (!onDelete || !activeEntry?.photoId) return
    setDeleting(true)
    try {
      await onDelete(selectedPane, activeEntry.photoId)
      setConfirmingDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  if (cropping && activeEntry) {
    return createPortal(
      <PhotoCropEditor
        photoDataUrl={activeEntry.photoDataUrl}
        onCancel={() => setCropping(false)}
        onSave={handleSaveCrop}
      />,
      document.body
    )
  }

  return createPortal(
    <div className={`lightbox-overlay ${sideBySide ? 'lightbox-overlay--split' : ''}`} onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>

      <div className={`lightbox-stage ${sideBySide ? 'lightbox-stage--split' : ''}`} onClick={e => e.stopPropagation()}>
        <LightboxPane
          // Keyed on the list's own date (or photoId as a fallback) so
          // swiping to a different date's `primary` array — a totally new
          // list from the parent, not just a different index within the
          // same one — remounts this pane fresh instead of reusing stale
          // index/zoom state meant for the old date's photo count.
          key={primary[0]?.date ?? primary[0]?.photoId ?? 'empty'}
          photos={primary}
          initialIndex={primaryInitialIndex}
          pane="primary"
          selectable={sideBySide}
          selected={selectedPane === 'primary'}
          onSelect={() => setSelectedPane('primary')}
          onActiveChange={handleActiveChange}
          onSwipeDate={sideBySide ? undefined : onSwipeDate}
        />
        {sideBySide && (
          <LightboxPane
            photos={secondary!}
            initialIndex={secondaryInitialIndex}
            pane="secondary"
            selectable
            selected={selectedPane === 'secondary'}
            onSelect={() => setSelectedPane('secondary')}
            onActiveChange={handleActiveChange}
          />
        )}
      </div>

      {editing ? (
        <div className="lightbox-edit" onClick={e => e.stopPropagation()}>
          <div className="lightbox-edit-row">
            <label>Date</label>
            <input
              type="date"
              value={values.date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setValues(v => ({ ...v, date: e.target.value }))}
            />
          </div>
          <div className="lightbox-edit-row">
            <label>Weight (lbs)</label>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Optional"
              value={values.weightLbs}
              onChange={e => setValues(v => ({ ...v, weightLbs: e.target.value }))}
            />
          </div>
          <div className="lightbox-edit-actions">
            <button className="lightbox-edit-cancel" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button className="lightbox-edit-save" onClick={() => void handleSave()} disabled={saving || !values.date}>
              {saving ? 'Saving…' : <><Check size={14} /> Save</>}
            </button>
          </div>
        </div>
      ) : confirmingDelete ? (
        <div className="lightbox-edit" onClick={e => e.stopPropagation()}>
          <p className="lightbox-delete-confirm-text">Delete this photo? This can't be undone.</p>
          <div className="lightbox-edit-actions">
            <button className="lightbox-edit-cancel" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</button>
            <button className="lightbox-edit-delete" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : <><Trash2 size={14} /> Delete</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="lightbox-caption" onClick={e => e.stopPropagation()}>
          {activeEntry?.caption && <div className="lightbox-caption-title">{activeEntry.caption}</div>}
          {activeEntry?.meta && <div className="lightbox-caption-meta">{activeEntry.meta}</div>}
          <div className="lightbox-caption-actions">
            {onSave && activeEntry?.photoId && (
              <button className="lightbox-edit-btn" onClick={openEdit}>
                <Pencil size={12} /> Edit
              </button>
            )}
            {onSavePhoto && activeEntry?.photoId && (
              <button className="lightbox-edit-btn" onClick={() => setCropping(true)}>
                <Crop size={12} /> Reposition
              </button>
            )}
            {activeEntry && (
              <button className="lightbox-edit-btn" onClick={() => void handleDownload(activeEntry)}>
                <Download size={12} /> Download
              </button>
            )}
            {onDelete && activeEntry?.photoId && (
              <button className="lightbox-edit-btn lightbox-edit-btn--delete" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
