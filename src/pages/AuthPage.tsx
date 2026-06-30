import { useState, useRef } from 'react'
import { Mail, Eye, EyeOff, AlertCircle, Loader } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { AUTH_PROVIDERS } from '../lib/authProviders'
import './AuthPage.css'

type View = 'landing' | 'email-signin' | 'email-signup'

export default function AuthPage() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, continueAsGuest, isSupabaseConfigured } = useAuth()

  const [view, setView] = useState<View>('landing')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  function clearState() { setError(null); setSuccess(null) }

  async function handleOAuth(provider: 'google' | 'apple') {
    clearState()
    setLoading(provider)
    try {
      if (provider === 'google') await signInWithGoogle()
      else await signInWithApple()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth sign-in failed')
      setLoading(null)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearState()
    setLoading('email')
    try {
      if (view === 'email-signin') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password)
        setSuccess('Check your email to confirm your account, then sign in.')
        setView('email-signin')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setLoading(null)
    }
  }

  // ── Landing view ──────────────────────────────────────────────────────────

  if (view === 'landing') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <img src="/icon.svg" alt="Shakthi Journal" className="auth-logo-img" />
          </div>
          <h1 className="auth-title">Shakthi Journal</h1>
          <p className="auth-subtitle">Personal health OS — private by default</p>

          {!isSupabaseConfigured && (
            <div className="auth-config-notice">
              Cloud sync is not configured. You can still use the app locally.
            </div>
          )}

          {isSupabaseConfigured && (
            <div className="auth-actions">
              {AUTH_PROVIDERS.apple.enabled && (
                <button
                  className="auth-btn auth-btn--apple"
                  onClick={() => handleOAuth('apple')}
                  disabled={!!loading}
                >
                  {loading === 'apple'
                    ? <Loader size={16} className="auth-spin" />
                    : <svg className="auth-provider-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  }
                  Continue with Apple
                </button>
              )}

              {AUTH_PROVIDERS.google.enabled && (
                <button
                  className="auth-btn auth-btn--google"
                  onClick={() => handleOAuth('google')}
                  disabled={!!loading}
                >
                  {loading === 'google'
                    ? <Loader size={16} className="auth-spin" />
                    : <svg className="auth-provider-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  }
                  Continue with Google
                </button>
              )}

              {AUTH_PROVIDERS.email.enabled && (
                <button
                  className="auth-btn auth-btn--email"
                  onClick={() => { clearState(); setView('email-signin'); setTimeout(() => emailRef.current?.focus(), 50) }}
                  disabled={!!loading}
                >
                  <Mail size={16} />
                  Continue with Email
                </button>
              )}

              <div className="auth-divider"><span>or</span></div>
            </div>
          )}

          {error && (
            <div className="auth-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Guest */}
          <button className="auth-guest-btn" onClick={continueAsGuest}>
            Continue as Guest
          </button>
          <p className="auth-guest-note">
            All data stays on this device. Sign in later from Settings to enable cloud sync.
          </p>
        </div>
      </div>
    )
  }

  // ── Email form ──────────────────────────────────────────────────────────────

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-back" onClick={() => { clearState(); setView('landing') }}>
          ← Back
        </button>
        <h2 className="auth-form-title">
          {view === 'email-signin' ? 'Sign in' : 'Create account'}
        </h2>

        {success && <div className="auth-success">{success}</div>}
        {error && (
          <div className="auth-error">
            <AlertCircle size={14} /><span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleEmailSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              ref={emailRef}
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-pw">Password</label>
            <div className="auth-pw-wrap">
              <input
                id="auth-pw"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={view === 'email-signup' ? 'At least 8 characters' : '••••••••'}
                required
                minLength={8}
                autoComplete={view === 'email-signin' ? 'current-password' : 'new-password'}
              />
              <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={!!loading}>
            {loading === 'email'
              ? <><Loader size={15} className="auth-spin" /> Working…</>
              : view === 'email-signin' ? 'Sign in' : 'Create account'
            }
          </button>
        </form>

        <button
          className="auth-toggle-mode"
          onClick={() => { clearState(); setView(view === 'email-signin' ? 'email-signup' : 'email-signin') }}
        >
          {view === 'email-signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
