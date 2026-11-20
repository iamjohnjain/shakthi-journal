import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Pencil, Check, Trash2 } from 'lucide-react'
import './PhotoLightbox.css'

interface EditValues {
  date: string
  weightLbs: string
}

/** Full-screen photo viewer — same portal pattern as LiveCamera. `caption`/
    `meta` are optional context lines shown under the image (e.g. the pose +
    date, and the closest known weight reading for that date) so a saved
    check-in photo carries its own context when blown up, not just pixels.

    `onSave` opts into an inline edit form (date + weight) and `onDelete`
    opts into a delete affordance (with an inline confirm step) — both only
    meaningful for an already-saved photo, so a caller viewing a not-yet-
    saved staged photo simply omits them and gets the plain read-only
    viewer. */
export default function PhotoLightbox({ photoDataUrl, caption, meta, onClose, editDate, editWeightLbs, onSave, onDelete }: {
  photoDataUrl: string
  caption?: string
  meta?: string
  onClose: () => void
  editDate?: string
  editWeightLbs?: number | null
  onSave?: (changes: { date: string; weightLbs: number | null }) => Promise<void> | void
  onDelete?: () => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [values, setValues] = useState<EditValues>({
    date: editDate ?? '',
    weightLbs: editWeightLbs != null ? String(editWeightLbs) : '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function openEdit() {
    setValues({ date: editDate ?? '', weightLbs: editWeightLbs != null ? String(editWeightLbs) : '' })
    setEditing(true)
  }

  async function handleSave() {
    if (!onSave || !values.date) return
    setSaving(true)
    try {
      const weightLbs = values.weightLbs.trim() ? Number(values.weightLbs) : null
      await onSave({ date: values.date, weightLbs: weightLbs != null && !Number.isNaN(weightLbs) ? weightLbs : null })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
      // Caller is expected to close the lightbox once the photo's gone —
      // no local state to reset to since this component won't still be
      // mounted after that.
    } finally {
      setDeleting(false)
    }
  }

  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>
      <img src={photoDataUrl} alt="" className="lightbox-img" onClick={e => e.stopPropagation()} />

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
      ) : (caption || meta || onSave || onDelete) && (
        <div className="lightbox-caption" onClick={e => e.stopPropagation()}>
          {caption && <div className="lightbox-caption-title">{caption}</div>}
          {meta && <div className="lightbox-caption-meta">{meta}</div>}
          {(onSave || onDelete) && (
            <div className="lightbox-caption-actions">
              {onSave && (
                <button className="lightbox-edit-btn" onClick={openEdit}>
                  <Pencil size={12} /> Edit date / weight
                </button>
              )}
              {onDelete && (
                <button className="lightbox-edit-btn lightbox-edit-btn--delete" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}
