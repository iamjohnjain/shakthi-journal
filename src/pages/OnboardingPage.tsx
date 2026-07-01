import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, Check, Mail, Eye, EyeOff, AlertCircle, Loader,
} from 'lucide-react'
import { setSetting } from '../db'
import { saveProfile, getProfile } from '../db/profileStore'
import { AvatarPicker, AvatarDisplay } from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { AUTH_PROVIDERS } from '../lib/authProviders'
import { syncEngine } from '../db/syncEngine'
import type { ProfileData } from '../db'
import './OnboardingPage.css'

// ─── Platform detection ───────────────────────────────────────────────────────

function getPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

// ─── Nutrition math ───────────────────────────────────────────────────────────

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 12, light: 13, moderate: 14, active: 15.5, 'very-active': 17,
}

function calcNutrition(goalWeightLbs: number, activityLevel: string, trainingDays: number) {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? (12 + trainingDays * 0.7)
  const calories = Math.round(goalWeightLbs * multiplier)
  const proteinG = Math.round(goalWeightLbs * 0.82)
  const proteinCal = proteinG * 4
  const fatG = Math.round((calories - proteinCal) * 0.3 / 9)
  const carbsG = Math.round((calories - proteinCal) * 0.7 / 4)
  return { calories, proteinG, fatG, carbsG, waterMl: 3785 }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  { id: 'sedentary',   label: 'Sedentary',    desc: 'Desk job, little or no exercise' },
  { id: 'light',       label: 'Light',         desc: 'Light exercise 1–3 days/week' },
  { id: 'moderate',    label: 'Moderate',      desc: 'Moderate exercise 3–5 days/week' },
  { id: 'active',      label: 'Active',        desc: 'Hard exercise 6–7 days/week' },
  { id: 'very-active', label: 'Very Active',   desc: 'Hard daily exercise + physical job' },
]

const PRIMARY_GOALS = [
  { id: 'fat-loss',       emoji: '🔥', label: 'Lose fat'         },
  { id: 'muscle-gain',    emoji: '💪', label: 'Build muscle'      },
  { id: 'strength',       emoji: '🏋️', label: 'Get stronger'      },
  { id: 'running',        emoji: '🏃', label: 'Improve endurance' },
  { id: 'general-health', emoji: '🩺', label: 'Feel healthier'    },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface OBData {
  name: string
  dob: string
  sex: '' | 'male' | 'female' | 'other'
  heightFt: string
  heightIn: string
  currentWeightLbs: string
  goalWeightLbs: string
  activityLevel: '' | 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active'
  avatarId?: string
  photoDataUrl?: string
  primaryGoals: string[]
  calorieGoal: string
  proteinGoal: string
  trainingDays: number
  intendToConnect: string[]
  importAfterSetup?: boolean
}

type AuthSubView = 'choose' | 'email-signup' | 'email-signin'

interface StepProps {
  data: OBData
  patch: (u: Partial<OBData>) => void
  onNext: () => void
  onSkip?: () => void
  dir: 'fwd' | 'bwd'
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function StepShell({ dir, children }: { dir: 'fwd' | 'bwd'; children: React.ReactNode }) {
  return <div className={`ob-step ${dir === 'bwd' ? 'ob-step--bwd' : ''}`}>{children}</div>
}

// Large number picker with ± stepper buttons for mobile-first feel.
// Uses local string state so the user can freely clear/type without React
// reverting the field. Value is committed to the parent only on blur or
// when a stepper button is pressed.
function NumberStepper({
  label, value, onChange, unit, min = 0, max = 9999, step = 1,
}: {
  label?: string; value: number; onChange: (v: number) => void
  unit?: string; min?: number; max?: number; step?: number
}) {
  const [display, setDisplay] = useState(String(value))
  const focusedRef = useRef(false)

  // Sync display from parent only when this field is not actively being edited
  useEffect(() => {
    if (!focusedRef.current) {
      setDisplay(String(value))
    }
  }, [value])

  const commit = useCallback((raw: string) => {
    const stripped = raw.replace(/[^0-9]/g, '')
    const n = parseInt(stripped, 10)
    if (!isNaN(n) && stripped !== '') {
      const clamped = Math.min(max, Math.max(min, n))
      setDisplay(String(clamped))
      onChange(clamped)
    } else {
      // Empty or non-numeric: restore the last valid value
      setDisplay(String(value))
    }
  }, [min, max, value, onChange])

  function dec() {
    const newVal = Math.max(min, value - step)
    setDisplay(String(newVal))
    onChange(newVal)
  }
  function inc() {
    const newVal = Math.min(max, value + step)
    setDisplay(String(newVal))
    onChange(newVal)
  }

  return (
    <div className="ob-stepper">
      {label && <span className="ob-stepper-label">{label}</span>}
      <div className="ob-stepper-row">
        <button type="button" className="ob-stepper-btn" onClick={dec} aria-label="Decrease">−</button>
        <div className="ob-stepper-center">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="ob-stepper-input"
            value={display}
            onChange={e => setDisplay(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={e => {
              focusedRef.current = true
              e.target.select()
              // Scroll input into view so the keyboard doesn't bury it
              setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350)
            }}
            onBlur={e => {
              focusedRef.current = false
              commit(e.target.value)
            }}
            aria-label={label}
          />
          {unit && <span className="ob-stepper-unit">{unit}</span>}
        </div>
        <button type="button" className="ob-stepper-btn" onClick={inc} aria-label="Increase">+</button>
      </div>
    </div>
  )
}

// ─── Step 0: Welcome + Auth ───────────────────────────────────────────────────

function StepWelcomeAuth({ onGuest, onAuthSuccess, dir }: {
  onGuest: () => void
  onAuthSuccess: () => void
  dir: 'fwd' | 'bwd'
}) {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple,
          continueAsGuest, isSupabaseConfigured } = useAuth()

  const [subView,   setSubView]   = useState<AuthSubView>('choose')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  function clear() { setError(null); setSuccess(null) }

  async function handleOAuth(provider: 'google' | 'apple') {
    clear()
    setLoading(provider)
    try {
      const returnTo = `${window.location.origin}/onboarding`
      if (provider === 'google') await signInWithGoogle(returnTo)
      else await signInWithApple(returnTo)
      // Page will redirect — nothing to do
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth sign-in failed')
      setLoading(null)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    clear()
    setLoading('email')
    try {
      if (subView === 'email-signin') {
        await signInWithEmail(email, password)
        onAuthSuccess()
      } else {
        await signUpWithEmail(email, password)
        setSuccess('Check your email and click the confirmation link. You\'ll be signed in automatically.')
        setSubView('email-signin')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setLoading(null)
    }
  }

  function handleGuest() {
    continueAsGuest()
    onGuest()
  }

  // ── Email form ──────────────────────────────────────────────────────────────

  if (subView === 'email-signup' || subView === 'email-signin') {
    const isSignup = subView === 'email-signup'
    return (
      <StepShell dir={dir}>
        <button className="ob-auth-back" onClick={() => { clear(); setSubView('choose') }}>
          <ChevronLeft size={18} /> Back
        </button>
        <div className="ob-question">
          <h1 className="ob-q-title">{isSignup ? 'Create\nyour account' : 'Sign in\nto your account'}</h1>
        </div>

        {error   && <div className="ob-auth-error"><AlertCircle size={14} /><span>{error}</span></div>}
        {success && <div className="ob-auth-success">{success}</div>}

        <form onSubmit={handleEmailSubmit} className="ob-auth-form">
          <div className="ob-auth-field">
            <label htmlFor="ob-email">Email</label>
            <input
              ref={emailRef}
              id="ob-email"
              className="ob-auth-field-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="ob-auth-field">
            <label htmlFor="ob-pw">Password</label>
            <div className="ob-auth-pw-wrap">
              <input
                id="ob-pw"
                className="ob-auth-field-input"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                minLength={isSignup ? 6 : undefined}
              />
              <button type="button" className="ob-auth-pw-toggle" onClick={() => setShowPw(v => !v)} aria-label="Toggle password">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="ob-footer">
            <button type="submit" className="ob-cta ob-cta--full" disabled={!!loading || !email || !password}>
              {loading === 'email' ? <Loader size={16} className="ob-spin" /> : null}
              {isSignup ? 'Create account' : 'Sign in'}
            </button>
            <p className="ob-auth-switch">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
              {' '}
              <button type="button" onClick={() => { clear(); setSubView(isSignup ? 'email-signin' : 'email-signup') }}>
                {isSignup ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </div>
        </form>
      </StepShell>
    )
  }

  // ── Choose view ─────────────────────────────────────────────────────────────

  return (
    <StepShell dir={dir}>
      <div className="ob-welcome-mark">S</div>
      <h1 className="ob-welcome-title">Shakthi Journal</h1>
      <p className="ob-welcome-sub">Your private health OS. Data stays on your device unless you create an account.</p>

      <div className="ob-spacer" />

      {error && <div className="ob-auth-error" style={{ marginBottom: 12 }}><AlertCircle size={14} /><span>{error}</span></div>}

      {isSupabaseConfigured && (
        <div className="ob-auth-providers">
          {AUTH_PROVIDERS.apple.enabled && (
            <button className="ob-auth-btn" onClick={() => handleOAuth('apple')} disabled={!!loading}>
              {loading === 'apple'
                ? <Loader size={16} className="ob-spin" />
                : <svg className="ob-auth-provider-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              }
              Continue with Apple
            </button>
          )}
          <button className="ob-auth-btn" onClick={() => handleOAuth('google')} disabled={!!loading}>
            {loading === 'google'
              ? <Loader size={16} className="ob-spin" />
              : <svg className="ob-auth-provider-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            }
            Continue with Google
          </button>
          <button className="ob-auth-btn" onClick={() => { clear(); setSubView('email-signup'); setTimeout(() => emailRef.current?.focus(), 80) }} disabled={!!loading}>
            <Mail size={16} />
            Continue with Email
          </button>
          <div className="ob-auth-divider"><span>or</span></div>
        </div>
      )}

      {!isSupabaseConfigured && (
        <div className="ob-auth-config-note">
          Cloud sync is not configured. All data stays on this device.
        </div>
      )}

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={handleGuest} disabled={!!loading}>
          Continue as Guest
        </button>
        <p className="ob-auth-sync-note">
          Creating an account lets your data sync across all of your devices.
        </p>
      </div>
    </StepShell>
  )
}

// ─── Step 1: Name ─────────────────────────────────────────────────────────────

function StepName({ data, patch, onNext, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What's your<br/>name?</h1>
        <p className="ob-q-sub">We'll use this to personalize your experience.</p>
      </div>
      <div className="ob-input-zone">
        <input
          className="ob-big-text-input"
          type="text"
          value={data.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="First name"
          autoFocus
          autoComplete="given-name"
        />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={!data.name.trim()}>
          Continue
        </button>
        <button className="ob-skip" onClick={onNext}>Skip for now</button>
      </div>
    </StepShell>
  )
}

// ─── Step 2: Identity (DOB + Sex) ─────────────────────────────────────────────

function StepIdentity({ data, patch, onNext, dir }: StepProps) {
  const today = new Date().toISOString().split('T')[0]
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">A few basics</h1>
        <p className="ob-q-sub">Used to personalize your baselines. Never shared.</p>
      </div>
      <div className="ob-form">
        <div className="ob-form-row">
          <label className="ob-field-label">Date of birth</label>
          <input
            className="ob-field-input"
            type="date"
            value={data.dob}
            onChange={e => patch({ dob: e.target.value })}
            max={today}
            min="1900-01-01"
          />
        </div>
        <div className="ob-form-row">
          <label className="ob-field-label">Sex</label>
          <div className="ob-segment">
            {(['male', 'female', 'other'] as const).map(s => (
              <button
                key={s}
                type="button"
                className={`ob-segment-btn ${data.sex === s ? 'ob-segment-btn--on' : ''}`}
                onClick={() => patch({ sex: s })}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
        <button className="ob-skip" onClick={onNext}>Skip for now</button>
      </div>
    </StepShell>
  )
}

// ─── Step 3: Height ───────────────────────────────────────────────────────────

function StepHeight({ data, patch, onNext, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">How tall<br/>are you?</h1>
      </div>
      <div className="ob-input-zone">
        <div className="ob-height-pickers">
          <div className="ob-picker-col">
            <select
              className="ob-drum-select"
              value={data.heightFt}
              onChange={e => patch({ heightFt: e.target.value })}
            >
              {[4, 5, 6, 7].map(f => (
                <option key={f} value={String(f)}>{f}</option>
              ))}
            </select>
            <span className="ob-picker-unit">ft</span>
          </div>
          <div className="ob-picker-col">
            <select
              className="ob-drum-select"
              value={data.heightIn}
              onChange={e => patch({ heightIn: e.target.value })}
            >
              {Array.from({ length: 12 }, (_, i) => i).map(i => (
                <option key={i} value={String(i)}>{i}</option>
              ))}
            </select>
            <span className="ob-picker-unit">in</span>
          </div>
        </div>
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
        <button className="ob-skip" onClick={onNext}>Skip for now</button>
      </div>
    </StepShell>
  )
}

// ─── Step 4: Current Weight ───────────────────────────────────────────────────

function StepCurrentWeight({ data, patch, onNext, dir }: StepProps) {
  const val = parseInt(data.currentWeightLbs) || 185
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What's your<br/>current weight?</h1>
        <p className="ob-q-sub">Your starting point for tracking progress.</p>
      </div>
      <div className="ob-input-zone">
        <NumberStepper
          value={val}
          onChange={v => patch({ currentWeightLbs: String(v) })}
          unit="lbs"
          min={80} max={500} step={1}
        />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={() => {
          ;(document.activeElement as HTMLElement | null)?.blur()
          if (!data.currentWeightLbs) patch({ currentWeightLbs: String(val) })
          setTimeout(onNext, 0)
        }}>Continue</button>
        <button className="ob-skip" onClick={onNext}>Skip for now</button>
      </div>
    </StepShell>
  )
}

// ─── Step 5: Goal Weight ──────────────────────────────────────────────────────

function StepGoalWeight({ data, patch, onNext, dir }: StepProps) {
  const current = parseInt(data.currentWeightLbs) || 185
  const val = parseInt(data.goalWeightLbs) || Math.max(130, current - 10)
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What's your<br/>goal weight?</h1>
        <p className="ob-q-sub">Where you want to be. You can always change this.</p>
      </div>
      <div className="ob-input-zone">
        <NumberStepper
          value={val}
          onChange={v => patch({ goalWeightLbs: String(v) })}
          unit="lbs"
          min={80} max={500} step={1}
        />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={() => {
          ;(document.activeElement as HTMLElement | null)?.blur()
          if (!data.goalWeightLbs) patch({ goalWeightLbs: String(val) })
          setTimeout(onNext, 0)
        }}>Continue</button>
        <button className="ob-skip" onClick={onNext}>Skip for now</button>
      </div>
    </StepShell>
  )
}

// ─── Step 6: Activity Level ───────────────────────────────────────────────────

function StepActivity({ data, patch, onNext, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">How active<br/>are you?</h1>
        <p className="ob-q-sub">Used to calculate your daily targets.</p>
      </div>
      <div className="ob-activity-list">
        {ACTIVITY_LEVELS.map(a => (
          <button
            key={a.id}
            type="button"
            className={`ob-activity-row ${data.activityLevel === a.id ? 'ob-activity-row--on' : ''}`}
            onClick={() => patch({ activityLevel: a.id as OBData['activityLevel'] })}
          >
            <div className="ob-activity-info">
              <div className="ob-activity-label">{a.label}</div>
              <div className="ob-activity-desc">{a.desc}</div>
            </div>
            <div className={`ob-activity-radio ${data.activityLevel === a.id ? 'ob-activity-radio--on' : ''}`} />
          </button>
        ))}
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>
          {data.activityLevel ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </StepShell>
  )
}

// ─── Step 7: Primary Goal ─────────────────────────────────────────────────────

function StepPrimaryGoal({ data, patch, onNext, dir }: StepProps) {
  function toggle(id: string) {
    const on = data.primaryGoals.includes(id)
    patch({ primaryGoals: on ? data.primaryGoals.filter(g => g !== id) : [id] })
  }
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What are you<br/>training for?</h1>
        <p className="ob-q-sub">Pick the one that fits best right now.</p>
      </div>
      <div className="ob-goal-list ob-goal-list--large">
        {PRIMARY_GOALS.map(g => {
          const on = data.primaryGoals.includes(g.id)
          return (
            <button key={g.id} type="button" className={`ob-goal-row ${on ? 'ob-goal-row--on' : ''}`} onClick={() => toggle(g.id)}>
              <span className="ob-goal-emoji">{g.emoji}</span>
              <span className="ob-goal-lbl">{g.label}</span>
              <span className={`ob-goal-dot ${on ? 'ob-goal-dot--on' : ''}`}><Check size={14} /></span>
            </button>
          )
        })}
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>
          {data.primaryGoals.length > 0 ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </StepShell>
  )
}

// ─── Step 8: Training Days ────────────────────────────────────────────────────

function StepTraining({ data, patch, onNext, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">How many days<br/>do you train?</h1>
        <p className="ob-q-sub">Per week on average.</p>
      </div>
      <div className="ob-input-zone">
        <div className="ob-day-selector ob-day-selector--large">
          {[2, 3, 4, 5, 6, 7].map(d => (
            <button
              key={d}
              type="button"
              className={`ob-day-tile ${data.trainingDays === d ? 'ob-day-tile--on' : ''}`}
              onClick={() => patch({ trainingDays: d })}
            >
              <span className="ob-day-num">{d}</span>
              <span className="ob-day-lbl">days</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
      </div>
    </StepShell>
  )
}

// ─── Step 9: Nutrition Targets ────────────────────────────────────────────────

function StepNutrition({ data, patch, onNext, dir }: StepProps) {
  useEffect(() => {
    const goalLbs = parseFloat(data.goalWeightLbs)
    if (!isNaN(goalLbs) && goalLbs > 0 && !data.calorieGoal) {
      const nut = calcNutrition(goalLbs, data.activityLevel || 'moderate', data.trainingDays)
      patch({ calorieGoal: String(nut.calories), proteinGoal: String(nut.proteinG) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const calories = parseInt(data.calorieGoal) || 2200
  const protein  = parseInt(data.proteinGoal) || 160

  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">Your nutrition<br/>targets</h1>
        <p className="ob-q-sub">Calculated from your goal and activity level. Adjust anytime.</p>
      </div>
      <div className="ob-nutrition-stack">
        <NumberStepper
          label="Daily calories"
          value={calories}
          onChange={v => patch({ calorieGoal: String(v) })}
          unit="kcal"
          min={1000} max={6000} step={50}
        />
        <NumberStepper
          label="Daily protein"
          value={protein}
          onChange={v => patch({ proteinGoal: String(v) })}
          unit="g"
          min={50} max={400} step={5}
        />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={() => {
          // Blur any focused input so its onBlur commit fires before we read state
          ;(document.activeElement as HTMLElement | null)?.blur()
          if (!data.calorieGoal) patch({ calorieGoal: String(calories) })
          if (!data.proteinGoal) patch({ proteinGoal: String(protein) })
          // Small delay so React can process the blur-triggered state update
          setTimeout(onNext, 0)
        }}>Continue</button>
        <button className="ob-skip" onClick={onNext}>Skip for now</button>
      </div>
    </StepShell>
  )
}

// ─── Step 10: Connect Sources ─────────────────────────────────────────────────

const CONNECT_SOURCES = [
  {
    id: 'apple-health',
    icon: '❤️',
    name: 'iPhone Health',
    desc: 'Steps, weight, sleep, heart rate, workouts',
  },
  {
    id: 'ringconn',
    icon: '💍',
    name: 'RingConn',
    desc: 'Blood oxygen, heart rate, sleep tracking',
  },
  {
    id: 'strava',
    icon: '🏃',
    name: 'Strava',
    desc: 'Runs, rides, GPS, pace, heart rate zones',
  },
  {
    id: 'myfitnesspal',
    icon: '🥗',
    name: 'MyFitnessPal',
    desc: 'Food log, calories, macros',
  },
  {
    id: 'garmin',
    icon: '⌚',
    name: 'Garmin',
    desc: 'GPS, HRV, VO₂ Max, training load',
  },
]

function StepConnectSources({ data, patch, onNext, dir }: StepProps) {
  const platform   = getPlatform()
  const isNativeApp =
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__shakthiNativeApp === true

  function toggle(id: string) {
    const on = data.intendToConnect.includes(id)
    patch({
      intendToConnect: on
        ? data.intendToConnect.filter(s => s !== id)
        : [...data.intendToConnect, id],
    })
  }

  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">Connect your<br/>health data</h1>
        <p className="ob-q-sub">
          Link apps and devices to see everything in one place.
        </p>
      </div>

      <div className="ob-source-list">
        {/* ── iPhone Health — platform-aware ── */}
        {isNativeApp ? (
          <div className="ob-source-row ob-source-row--connected">
            <span className="ob-source-icon">❤️</span>
            <div className="ob-source-info">
              <span className="ob-source-name">iPhone Health</span>
              <span className="ob-source-desc">Connected via the Shakthi Journal iPhone app</span>
            </div>
            <span className="ob-source-badge ob-source-badge--connected"><Check size={13} /> Connected</span>
          </div>
        ) : platform === 'ios' ? (
          <div className="ob-source-row ob-source-row--native">
            <span className="ob-source-icon">❤️</span>
            <div className="ob-source-info">
              <span className="ob-source-name">iPhone Health</span>
              <span className="ob-source-desc">
                Download the <strong>Shakthi Journal</strong> iPhone app to connect Apple Health directly.
                {' '}<span className="ob-source-note">Direct sync, no file export needed.</span>
              </span>
            </div>
            <span className="ob-source-badge ob-source-badge--native">iPhone app</span>
          </div>
        ) : (
          <div className="ob-source-row ob-source-row--native">
            <span className="ob-source-icon">❤️</span>
            <div className="ob-source-info">
              <span className="ob-source-name">iPhone Health</span>
              <span className="ob-source-desc">
                Available in the Shakthi Journal iPhone app.
                {' '}<span className="ob-source-note">Open this app on your iPhone for direct HealthKit sync.</span>
              </span>
            </div>
            <span className="ob-source-badge ob-source-badge--native">iPhone app</span>
          </div>
        )}

        {/* ── Other sources — intent tagging + coming soon ── */}
        {CONNECT_SOURCES.filter(s => s.id !== 'apple-health').map(s => {
          const on = data.intendToConnect.includes(s.id)
          return (
            <button
              key={s.id}
              type="button"
              className={`ob-source-row ob-source-row--soon ${on ? 'ob-source-row--intent' : ''}`}
              onClick={() => toggle(s.id)}
            >
              <span className="ob-source-icon">{s.icon}</span>
              <div className="ob-source-info">
                <span className="ob-source-name">{s.name}</span>
                <span className="ob-source-desc">{s.desc}</span>
              </div>
              <span className={`ob-source-badge ${on ? 'ob-source-badge--intent' : 'ob-source-badge--soon'}`}>
                {on ? 'Notify me' : 'Coming soon'}
              </span>
            </button>
          )
        })}
      </div>

      <p className="ob-connect-footnote">
        Advanced import (Apple Health export.xml) is available after setup in Settings → Import Data.
      </p>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
      </div>
    </StepShell>
  )
}

// ─── Step 5: Avatar ───────────────────────────────────────────────────────────

function StepAvatar({ data, patch, onNext, dir }: StepProps) {
  const displayName = data.name.trim() || 'You'
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">Pick your<br/>avatar</h1>
        <p className="ob-q-sub">Choose an animal that represents you.</p>
      </div>
      <div className="ob-input-zone ob-input-zone--avatar">
        <div className="ob-avatar-preview">
          <AvatarDisplay name={displayName} avatarId={data.avatarId} size="lg" />
          <span className="ob-avatar-preview-name">{displayName}</span>
        </div>
        <AvatarPicker selectedId={data.avatarId} onSelect={id => patch({ avatarId: id })} />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>
          {data.avatarId ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </StepShell>
  )
}

// ─── Step 12: Review ──────────────────────────────────────────────────────────

function StepReview({ data, onNext, dir, goTo }: StepProps & { goTo: (s: number) => void }) {
  const goalLabels = PRIMARY_GOALS.filter(g => data.primaryGoals.includes(g.id)).map(g => g.label)
  const heightStr  = data.heightFt ? `${data.heightFt}′ ${data.heightIn || '0'}″` : '—'

  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">Review your<br/>setup</h1>
        <p className="ob-q-sub">Everything looks good? You can change anything after setup too.</p>
      </div>

      <div className="ob-review-list">
        {/* Profile */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <span className="ob-review-card-title">Profile</span>
            <button className="ob-review-edit-btn" onClick={() => goTo(1)}>Edit</button>
          </div>
          {[
            ['Name',           data.name.trim() || '—'],
            ['Date of birth',  data.dob || '—'],
            ['Sex',            data.sex ? data.sex.charAt(0).toUpperCase() + data.sex.slice(1) : '—'],
            ['Height',         heightStr],
            ['Current weight', data.currentWeightLbs ? `${data.currentWeightLbs} lbs` : '—'],
            ['Goal weight',    data.goalWeightLbs ? `${data.goalWeightLbs} lbs` : '—'],
            ['Activity',       ACTIVITY_LEVELS.find(a => a.id === data.activityLevel)?.label ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="ob-review-row">
              <span className="ob-review-key">{k}</span>
              <span className="ob-review-val">{v}</span>
            </div>
          ))}
        </div>

        {/* Goals */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <span className="ob-review-card-title">Goals</span>
            <button className="ob-review-edit-btn" onClick={() => goTo(7)}>Edit</button>
          </div>
          {[
            ['Objective', goalLabels.length > 0 ? goalLabels.join(', ') : '—'],
            ['Training',  `${data.trainingDays} days/week`],
            ['Calories',  data.calorieGoal ? `${data.calorieGoal} kcal/day` : '—'],
            ['Protein',   data.proteinGoal ? `${data.proteinGoal} g/day` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="ob-review-row">
              <span className="ob-review-key">{k}</span>
              <span className="ob-review-val">{v}</span>
            </div>
          ))}
        </div>

        {/* Connections */}
        {data.intendToConnect.length > 0 && (
          <div className="ob-review-card">
            <div className="ob-review-card-header">
              <span className="ob-review-card-title">Notify me when ready</span>
              <button className="ob-review-edit-btn" onClick={() => goTo(10)}>Edit</button>
            </div>
            <div className="ob-review-row">
              <span className="ob-review-key">Sources</span>
              <span className="ob-review-val">
                {data.intendToConnect
                  .map(id => CONNECT_SOURCES.find(s => s.id === id)?.name)
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          </div>
        )}

        {/* Avatar */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <span className="ob-review-card-title">Avatar</span>
            <button className="ob-review-edit-btn" onClick={() => goTo(11)}>Edit</button>
          </div>
          <div className="ob-review-row">
            <span className="ob-review-key">Avatar</span>
            <span className="ob-review-val">
              <AvatarDisplay name={data.name.trim() || 'You'} avatarId={data.avatarId} size="sm" />
            </span>
          </div>
        </div>
      </div>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Finish setup</button>
      </div>
    </StepShell>
  )
}

// ─── Finish screen ────────────────────────────────────────────────────────────

function ScreenFinish({ name, loading, isEdit, onFinish }: {
  name: string; loading: boolean; isEdit: boolean; onFinish: () => void
}) {
  return (
    <div className="ob-step ob-step--center">
      <div className="ob-finish-icon"><Check size={34} strokeWidth={3} /></div>
      <h1 className="ob-finish-title">{name ? `You're all set,\n${name}.` : "You're all set."}</h1>
      <p className="ob-finish-sub">Your profile has been saved.</p>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onFinish} disabled={loading}>
          {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Enter Shakthi Journal'}
        </button>
        <p className="ob-fine-print">All settings can be adjusted anytime in the app.</p>
      </div>
    </div>
  )
}

// ─── Auth loading ─────────────────────────────────────────────────────────────

function AuthLoadingScreen() {
  return (
    <div className="ob-step ob-step--center">
      <div className="ob-auth-loading">
        <Loader size={28} className="ob-spin" />
        <span>Syncing your profile…</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Steps: 0=welcome/auth, 1=name, 2=identity, 3=height, 4=current-weight, 5=goal-weight,
//        6=activity, 7=primary-goal, 8=training, 9=nutrition, 10=connect, 11=avatar, 12=review, 13=finish
const CONTENT_STEPS = 11  // steps 1–11 shown in progress bar (review and finish are outside)

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isEdit = searchParams.get('edit') === '1'

  const { mode } = useAuth()
  const didHandleAuth = useRef(false)

  const [step,           setStep]           = useState(isEdit ? 1 : 0)
  const [dir,            setDir]            = useState<'fwd' | 'bwd'>('fwd')
  const [loading,        setLoading]        = useState(false)
  const [syncingProfile, setSyncingProfile] = useState(false)

  const [data, setData] = useState<OBData>({
    name: '', dob: '', sex: '', heightFt: '5', heightIn: '10',
    currentWeightLbs: '', goalWeightLbs: '', activityLevel: '',
    avatarId: undefined, primaryGoals: [], calorieGoal: '', proteinGoal: '',
    trainingDays: 4, intendToConnect: [],
  })

  function patch(u: Partial<OBData>) { setData(prev => ({ ...prev, ...u })) }

  function prefillFromProfile(p: ProfileData) {
    const ft = p.heightCm ? Math.floor(p.heightCm / 30.48) : undefined
    const inches = p.heightCm && ft !== undefined ? Math.round((p.heightCm - ft * 30.48) / 2.54) : undefined
    setData(prev => ({
      ...prev,
      name:             p.name                         ?? prev.name,
      dob:              p.dob                          ?? prev.dob,
      sex:              p.sex                          ?? prev.sex,
      activityLevel:    p.activityLevel                ?? prev.activityLevel,
      avatarId:         p.avatarId                     ?? prev.avatarId,
      photoDataUrl:     p.photoDataUrl                 ?? prev.photoDataUrl,
      heightFt:         ft !== undefined ? String(ft)  : prev.heightFt,
      heightIn:         inches !== undefined ? String(inches) : prev.heightIn,
      currentWeightLbs: p.startWeightKg ? String(Math.round(p.startWeightKg * 2.20462)) : prev.currentWeightLbs,
      goalWeightLbs:    p.goalWeightKg  ? String(Math.round(p.goalWeightKg  * 2.20462)) : prev.goalWeightLbs,
    }))
  }

  // ── Load profile in edit mode ───────────────────────────────────────────────

  useEffect(() => {
    if (!isEdit) return
    getProfile().then(p => { if (p) prefillFromProfile(p) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit])

  // ── Handle auth success (sign-in during onboarding, or OAuth redirect return) ─

  useEffect(() => {
    if (isEdit) return
    if (mode !== 'authenticated') return
    if (didHandleAuth.current) return
    didHandleAuth.current = true

    setSyncingProfile(true)
    ;(async () => {
      try {
        await Promise.race([
          syncEngine.syncNow(),
          new Promise<void>(r => setTimeout(r, 3000)),
        ])
      } catch { /* non-critical */ }
      const p = await getProfile()
      if (p) prefillFromProfile(p)
      setSyncingProfile(false)
      setDir('fwd')
      setStep(1)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function go(next: number) {
    setDir(next > step ? 'fwd' : 'bwd')
    setStep(next)
  }

  // ── Save and finish ─────────────────────────────────────────────────────────

  async function handleFinish() {
    setLoading(true)
    try {
      // In edit mode, load existing profile so we can preserve fields not managed
      // by the onboarding form (startBodyFatPct, goalBodyFatPct, bio, photoDataUrl,
      // and the original startDate which must never be overwritten on re-run).
      const existing = isEdit ? await getProfile() : null

      const ft = parseInt(data.heightFt)
      const heightCm = !isNaN(ft) && ft > 0
        ? Math.round(ft * 30.48 + (parseInt(data.heightIn) || 0) * 2.54)
        : undefined
      const today = new Date().toISOString().split('T')[0]

      await saveProfile({
        // Preserve non-onboarding fields from existing profile
        startBodyFatPct: existing?.startBodyFatPct,
        goalBodyFatPct:  existing?.goalBodyFatPct,
        bio:             existing?.bio,
        photoDataUrl:    data.photoDataUrl ?? existing?.photoDataUrl,
        // Onboarding-managed fields
        name:            data.name.trim() || 'Me',
        dob:             data.dob         || undefined,
        sex:             data.sex         || undefined,
        activityLevel:   data.activityLevel || undefined,
        avatarId:        data.avatarId,
        heightCm,
        startDate:       isEdit ? (existing?.startDate ?? today) : today,
        startWeightKg:   data.currentWeightLbs
          ? +(parseFloat(data.currentWeightLbs) / 2.20462).toFixed(1)
          : existing?.startWeightKg,
        goalWeightKg:    data.goalWeightLbs
          ? +(parseFloat(data.goalWeightLbs) / 2.20462).toFixed(1)
          : existing?.goalWeightKg,
        goalNotes:       data.primaryGoals.join(', ') || undefined,
      })

      const calGoal = parseInt(data.calorieGoal)
      const protGoal = parseInt(data.proteinGoal)
      const goalLbs = parseFloat(data.goalWeightLbs)

      let nut = { calories: 2300, proteinG: 160, fatG: 70, carbsG: 220, waterMl: 3785 }
      if (!isNaN(goalLbs) && goalLbs > 0) {
        nut = calcNutrition(goalLbs, data.activityLevel || 'moderate', data.trainingDays)
      }
      if (!isNaN(calGoal) && calGoal > 0) nut.calories = calGoal
      if (!isNaN(protGoal) && protGoal > 0) nut.proteinG = protGoal

      await setSetting('nutrition-goals', { ...nut, macroFirstMode: false })
      await setSetting('nutrition.targets', {
        caloriesIn: nut.calories, proteinG: nut.proteinG,
        carbsG: nut.carbsG, fatG: nut.fatG, waterMl: nut.waterMl,
      })
      await setSetting('onboarding.completed', true)
      await setSetting('onboarding.goals', data.primaryGoals)
      await setSetting('onboarding.intendToConnect', data.intendToConnect)
      await setSetting('training.daysPerWeek', data.trainingDays)

      const dest = isEdit ? '/profile' : (data.importAfterSetup ? '/import/apple-health' : '/')
      navigate(dest, { replace: true })
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (syncingProfile) return <div className="ob-page"><AuthLoadingScreen /></div>

  const showHeader  = step >= 1 && step <= 12
  const progressPct = step >= 1 && step <= 11
    ? Math.round(((step - 1) / CONTENT_STEPS) * 100)
    : step > 11 ? 100 : 0
  const sp: StepProps = { data, patch, onNext: () => go(step + 1), dir }

  return (
    <div className="ob-page">
      {showHeader && (
        <header className="ob-header">
          {step > 1 && (
            <button className="ob-back-btn" onClick={() => go(step - 1)} aria-label="Go back">
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="ob-progress-track">
            <div className="ob-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </header>
      )}

      {step === 0  && (
        <StepWelcomeAuth
          dir={dir}
          onGuest={() => go(1)}
          onAuthSuccess={() => {/* handled by mode useEffect */}}
        />
      )}
      {step === 1  && <StepName          key={1}  {...sp} />}
      {step === 2  && <StepIdentity      key={2}  {...sp} />}
      {step === 3  && <StepHeight        key={3}  {...sp} />}
      {step === 4  && <StepCurrentWeight key={4}  {...sp} />}
      {step === 5  && <StepGoalWeight    key={5}  {...sp} />}
      {step === 6  && <StepActivity      key={6}  {...sp} />}
      {step === 7  && <StepPrimaryGoal   key={7}  {...sp} />}
      {step === 8  && <StepTraining      key={8}  {...sp} />}
      {step === 9  && <StepNutrition     key={9}  {...sp} />}
      {step === 10 && <StepConnectSources key={10} {...sp} />}
      {step === 11 && <StepAvatar        key={11} {...sp} />}
      {step === 12 && (
        <StepReview key={12} {...sp} onNext={() => go(13)} goTo={go} />
      )}
      {step === 13 && (
        <ScreenFinish
          name={data.name.trim()}
          loading={loading}
          isEdit={isEdit}
          onFinish={handleFinish}
        />
      )}
    </div>
  )
}
