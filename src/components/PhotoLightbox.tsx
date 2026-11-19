import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './PhotoLightbox.css'

/** Full-screen photo viewer — same portal pattern as LiveCamera. `caption`/
    `meta` are optional context lines shown under the image (e.g. the pose +
    date, and the closest known weight reading for that date) so a saved
    check-in photo carries its own context when blown up, not just pixels. */
export default function PhotoLightbox({ photoDataUrl, caption, meta, onClose }: {
  photoDataUrl: string
  caption?: string
  meta?: string
  onClose: () => void
}) {
  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>
      <img src={photoDataUrl} alt="" className="lightbox-img" onClick={e => e.stopPropagation()} />
      {(caption || meta) && (
        <div className="lightbox-caption" onClick={e => e.stopPropagation()}>
          {caption && <div className="lightbox-caption-title">{caption}</div>}
          {meta && <div className="lightbox-caption-meta">{meta}</div>}
        </div>
      )}
    </div>,
    document.body
  )
}
