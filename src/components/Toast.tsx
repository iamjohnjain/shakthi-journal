import { useState, useEffect, useCallback } from 'react'
import { Check, X, AlertCircle, Info } from 'lucide-react'
import type { ToastEvent } from '../utils/toast'
import './Toast.css'

export default function Toast() {
  const [toasts, setToasts] = useState<ToastEvent[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    function onToast(e: Event) {
      const toast = (e as CustomEvent<ToastEvent>).detail
      setToasts(prev => [...prev.slice(-2), toast]) // keep max 3
      setTimeout(() => dismiss(toast.id), 3200)
    }
    window.addEventListener('app-toast', onToast)
    return () => window.removeEventListener('app-toast', onToast)
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast-icon" aria-hidden="true">
            {t.type === 'success' && <Check size={14} strokeWidth={2.5} />}
            {t.type === 'error'   && <AlertCircle size={14} />}
            {t.type === 'info'    && <Info size={14} />}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
