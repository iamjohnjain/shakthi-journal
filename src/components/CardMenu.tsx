import { useState, useEffect, useRef } from 'react'
import { MoreVertical, EyeOff, ChevronUp, ChevronDown, Pin } from 'lucide-react'
import './CardMenu.css'

interface CardMenuProps {
  id: string
  label: string
  canMoveUp: boolean
  canMoveDown: boolean
  onHide: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onPin: () => void
}

export function CardMenu({ id: _id, label, canMoveUp, canMoveDown, onHide, onMoveUp, onMoveDown, onPin }: CardMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function act(fn: () => void) {
    fn()
    setOpen(false)
  }

  return (
    <div className="card-menu" ref={ref}>
      <button
        className="card-menu-trigger"
        onClick={() => setOpen(o => !o)}
        aria-label={`Options for ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreVertical size={14} />
      </button>

      {open && (
        <div className="card-menu-popover" role="menu">
          {canMoveUp && (
            <button className="card-menu-item" role="menuitem" onClick={() => act(onMoveUp)}>
              <ChevronUp size={13} /> Move up
            </button>
          )}
          {canMoveDown && (
            <button className="card-menu-item" role="menuitem" onClick={() => act(onMoveDown)}>
              <ChevronDown size={13} /> Move down
            </button>
          )}
          {canMoveUp && (
            <button className="card-menu-item" role="menuitem" onClick={() => act(onPin)}>
              <Pin size={13} /> Pin to top
            </button>
          )}
          <div className="card-menu-divider" />
          <button className="card-menu-item card-menu-item--danger" role="menuitem" onClick={() => act(onHide)}>
            <EyeOff size={13} /> Hide section
          </button>
        </div>
      )}
    </div>
  )
}
