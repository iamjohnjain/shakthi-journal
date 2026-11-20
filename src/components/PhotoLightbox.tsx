import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Pencil, Check, Trash2, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSwipePage } from '../hooks/useSwipePage'
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

/** Full-screen photo viewer — same portal pattern as LiveCamera.

    `primary` is always the photo list being viewed — a single-item list for
    a plain "tap one photo" open, or several for swipe-paging through a set
    (the main Check-Ins grid, or a run of staged photos). `secondary`, when
    given, is a same-length second list shown side-by-side with `primary` at
    the same index — Compare mode's "both dates at once" view. Swiping pages
    both lists together, keeping the pair in sync.

    `onSave`/`onDelete` opt into the inline edit form / delete confirm for
    whichever pane is currently selected (tap a pane to select it when both
    are present) — both only meaningful for an already-saved photo, so a
    caller viewing a not-yet-saved staged photo simply omits them. */
export default function PhotoLightbox({
  primary, secondary, index, onIndexChange, onClose, onSave, onDelete,
}: {
  primary: (LightboxEntry | null)[]
  secondary?: (LightboxEntry | null)[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  onSave?: (pane: Pane, photoId: string, changes: { date: string; weightLbs: number | null }) => Promise<void> | void
  onDelete?: (pane: Pane, photoId: string) => Promise<void> | void
}) {
  const [selectedPane, setSelectedPane] = useState<Pane>('primary')
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sideBySide = !!secondary
  const activeEntry = (sideBySide && selectedPane === 'secondary' ? secondary![index] : primary[index]) ?? null
  const canPage = primary.length > 1
  const atStart = index <= 0
  const atEnd = index >= primary.length - 1

  function goPrev() { if (!atStart) { setEditing(false); setConfirmingDelete(false); onIndexChange(index - 1) } }
  function goNext() { if (!atEnd) { setEditing(false); setConfirmingDelete(false); onIndexChange(index + 1) } }
  const swipe = useSwipePage(goPrev, goNext)

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

  function renderPane(entry: LightboxEntry | null, pane: Pane) {
    const selected = sideBySide && selectedPane === pane
    return (
      <div
        className={`lightbox-pane ${sideBySide ? 'lightbox-pane--split' : ''} ${selected ? 'lightbox-pane--selected' : ''}`}
        onClick={e => { e.stopPropagation(); if (sideBySide) setSelectedPane(pane) }}
      >
        {entry ? (
          <img src={entry.photoDataUrl} alt="" className="lightbox-img" />
        ) : (
          <div className="lightbox-pane-empty">No photo</div>
        )}
      </div>
    )
  }

  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>

      <div
        className={`lightbox-stage ${sideBySide ? 'lightbox-stage--split' : ''}`}
        onClick={e => e.stopPropagation()}
        onTouchStart={swipe.onTouchStart}
        onTouchEnd={swipe.onTouchEnd}
      >
        {canPage && !atStart && (
          <button className="lightbox-nav lightbox-nav--prev" onClick={e => { e.stopPropagation(); goPrev() }} aria-label="Previous">
            <ChevronLeft size={22} />
          </button>
        )}
        {renderPane(primary[index] ?? null, 'primary')}
        {sideBySide && renderPane(secondary![index] ?? null, 'secondary')}
        {canPage && !atEnd && (
          <button className="lightbox-nav lightbox-nav--next" onClick={e => { e.stopPropagation(); goNext() }} aria-label="Next">
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {canPage && (
        <div className="lightbox-dots" onClick={e => e.stopPropagation()}>
          {primary.map((_, i) => (
            <span key={i} className={`lightbox-dot ${i === index ? 'lightbox-dot--active' : ''}`} />
          ))}
        </div>
      )}

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
