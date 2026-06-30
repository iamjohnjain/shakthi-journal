export type ToastType = 'success' | 'error' | 'info'

export interface ToastEvent {
  id: number
  message: string
  type: ToastType
}

export function showToast(message: string, type: ToastType = 'success') {
  window.dispatchEvent(
    new CustomEvent<ToastEvent>('app-toast', {
      detail: { id: Date.now(), message, type },
    })
  )
}
