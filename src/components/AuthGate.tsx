import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps the /auth page.
 * - Initializing → show nothing (brief flash while session resolves)
 * - Authenticated → redirect to / (already signed in)
 * - Guest → show the auth page (can sign in or continue as guest)
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { mode } = useAuth()

  if (mode === 'initializing') return null
  if (mode === 'authenticated') return <Navigate to="/" replace />
  return <>{children}</>
}
