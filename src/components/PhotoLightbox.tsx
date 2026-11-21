import { useState, useEffect, useCallback } from 'react'
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
function LightboxPane({ photos, initialIndex, pane, selectable, selected, onSelect, onActiveChange }: {
  photos: (LightboxEntry | null)[]
  initialIndex: number
  pane: Pane
  selectable: boolean
  selected: boolean
  onSelect: () => void
  onActiveChange: (pane: Pane, entry: LightboxEntry | null) => void
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, photos.length - 1)))
  const peek = useVerticalPeekSwipe({ index, count: photos.length, onChange: setIndex })

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
        onTouchStart={peek.handlers.onTouchStart}
        onTouchMove={peek.handlers.onTouchMove}
        onTouchEnd={peek.handlers.onTouchEnd}
      >
        <div
          className="lightbox-pane-track"
          style={{
            transform: `translateY(calc(-33.3333% + ${peek.dragY}px))`,
            transition: peek.animating ? 'transform 0.26s cubic-bezier(.2,.8,.2,1)' : 'none',
          }}
        >
          <div className="lightbox-peek-slot">
            {prev && <img src={prev.photoDataUrl} alt="" className="lightbox-img lightbox-peek-img" />}
          </div>
          <div className="lightbox-peek-slot lightbox-peek-slot--current">
            {current ? (
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
  primary, secondary, primaryInitialIndex = 0, secondaryInitialIndex = 0, onClose, onSave, onDelete, onSavePhoto,
}: {
  primary: (LightboxEntry | null)[]
  secondary?: (LightboxEntry | null)[]
  primaryInitialIndex?: number
  secondaryInitialIndex?: number
  onClose: () => void
  onSave?: (pane: Pane, photoId: string, changes: { date: string; weightLbs: number | null }) => Promise<void> | void
  onDelete?: (pane: Pane, photoId: string) => Promise<void> | void
  onSavePhoto?: (pane: Pane, photoId: string, newDataUrl: string) => Promise<void> | void
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

  function handleDownload(entry: LightboxEntry) {
    const a = document.createElement('a')
    a.href = entry.photoDataUrl
    a.download = `jeevan-checkin-${entry.date ?? new Date().toISOString().slice(0, 10)}.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
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
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>

      <div className={`lightbox-stage ${sideBySide ? 'lightbox-stage--split' : ''}`} onClick={e => e.stopPropagation()}>
        <LightboxPane
          photos={primary}
          initialIndex={primaryInitialIndex}
          pane="primary"
          selectable={sideBySide}
          selected={selectedPane === 'primary'}
          onSelect={() => setSelectedPane('primary')}
          onActiveChange={handleActiveChange}
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
              <button className="lightbox-edit-btn" onClick={() => handleDownload(activeEntry)}>
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
