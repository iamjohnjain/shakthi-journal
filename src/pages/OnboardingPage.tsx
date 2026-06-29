import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Check } from 'lucide-react'
import { setSetting } from '../db'
import { saveProfile } from '../db/profileStore'
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

function calcNutrition(goalWeightLbs: number, trainingDays: number) {
  const proteinG = Math.round(goalWeightLbs * 0.82)
  const multipliers = [12, 12, 12, 13.5, 14, 15, 16, 17]
  const calories = Math.round(goalWeightLbs * (multipliers[trainingDays] ?? 14))
  const proteinCal = proteinG * 4
  const fatG = Math.round((calories - proteinCal) * 0.3 / 9)
  const carbsG = Math.round((calories - proteinCal) * 0.7 / 4)
  return { calories, proteinG, fatG, carbsG, waterMl: 3785 }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { id: 'fat-loss',       emoji: '🔥', label: 'Lose fat'         },
  { id: 'muscle-gain',    emoji: '💪', label: 'Build muscle'      },
  { id: 'strength',       emoji: '🏋️', label: 'Get stronger'      },
  { id: 'running',        emoji: '🏃', label: 'Improve endurance' },
  { id: 'general-health', emoji: '🩺', label: 'Feel healthier'    },
]

const SOURCES_IOS = [
  { id: 'apple-health', emoji: '❤️', name: 'Apple Health',    desc: 'Sleep, weight, heart rate, steps', status: 'import-ready' },
  { id: 'strava',       emoji: '🧡', name: 'Strava',          desc: 'Runs, rides, workouts',            status: 'connect'      },
  { id: 'garmin',       emoji: '⌚', name: 'Garmin Connect', desc: 'Watch data, HRV, workouts',        status: 'coming-soon'  },
  { id: 'oura',         emoji: '💍', name: 'Oura Ring',       desc: 'Sleep, HRV, readiness',            status: 'coming-soon'  },
]

const SOURCES_ANDROID = [
  { id: 'google-fit', emoji: '🟢', name: 'Google Fit',     desc: 'Steps, weight, heart rate', status: 'coming-soon' },
  { id: 'strava',     emoji: '🧡', name: 'Strava',         desc: 'Runs, rides, workouts',     status: 'connect'     },
  { id: 'garmin',     emoji: '⌚', name: 'Garmin Connect', desc: 'Watch data, HRV, workouts', status: 'coming-soon' },
  { id: 'whoop',      emoji: '⚡', name: 'WHOOP',          desc: 'Strain, recovery, sleep',   status: 'coming-soon' },
]

const SOURCES_DESKTOP = [
  { id: 'strava',       emoji: '🧡', name: 'Strava',          desc: 'Runs, rides, workouts',         status: 'connect'      },
  { id: 'apple-health', emoji: '❤️', name: 'Apple Health',    desc: 'Best imported from iPhone',     status: 'import-ready' },
  { id: 'garmin',       emoji: '⌚', name: 'Garmin Connect', desc: 'Watch data, HRV, workouts',      status: 'coming-soon'  },
  { id: 'whoop',        emoji: '⚡', name: 'WHOOP',           desc: 'Strain, recovery, sleep',        status: 'coming-soon'  },
]

const SOURCE_STATUS: Record<string, { text: string; color: string }> = {
  'import-ready': { text: 'Ready to import', color: 'var(--green)'         },
  'connect':      { text: 'Connect later',   color: 'var(--blue)'          },
  'coming-soon':  { text: 'Coming soon',     color: 'var(--text-tertiary)' },
}

// ─── Shared types ─────────────────────────────────────────────────────────────

interface OBData {
  name: string
  currentWeightLbs: string
  goalWeightLbs: string
  heightFt: string
  heightIn: string
  age: string
  trainingDays: number
  goals: string[]
  intendToConnect: string[]
}

interface StepProps {
  data: OBData
  patch: (u: Partial<OBData>) => void
  onNext: () => void
  onSkip: () => void
  dir: 'fwd' | 'bwd'
}

// ─── Shared large input ───────────────────────────────────────────────────────

function BigInput({
  type = 'text', value, onChange, placeholder, unit, autoFocus = false,
}: {
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  unit?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => ref.current?.focus(), 140)
      return () => clearTimeout(t)
    }
  }, [autoFocus])

  return (
    <div className="ob-big-field">
      <input
        ref={ref}
        type={type}
        inputMode={type === 'number' ? 'decimal' : 'text'}
        className="ob-big-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {unit && <span className="ob-big-unit">{unit}</span>}
    </div>
  )
}

// ─── Step shell with directional animation ────────────────────────────────────

function StepShell({ dir, children }: { dir: 'fwd' | 'bwd'; children: React.ReactNode }) {
  return (
    <div className={`ob-step ${dir === 'bwd' ? 'ob-step--bwd' : ''}`}>
      {children}
    </div>
  )
}

// ─── Steps 1–8 ───────────────────────────────────────────────────────────────

function StepName({ data, patch, onNext, onSkip, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What's your<br/>name?</h1>
      </div>
      <div className="ob-input-zone">
        <BigInput value={data.name} onChange={v => patch({ name: v })} placeholder="First name" autoFocus />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={!data.name.trim()}>Continue</button>
        <button className="ob-skip" onClick={onSkip}>Skip for now</button>
      </div>
    </StepShell>
  )
}

function StepCurrentWeight({ data, patch, onNext, onSkip, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What's your<br/>current weight?</h1>
        <p className="ob-q-sub">This is your starting point.</p>
      </div>
      <div className="ob-input-zone">
        <BigInput type="number" value={data.currentWeightLbs} onChange={v => patch({ currentWeightLbs: v })} placeholder="185" unit="lbs" autoFocus />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={!data.currentWeightLbs}>Continue</button>
        <button className="ob-skip" onClick={onSkip}>Skip for now</button>
      </div>
    </StepShell>
  )
}

function StepGoalWeight({ data, patch, onNext, onSkip, dir }: StepProps) {
  const ph = data.currentWeightLbs
    ? String(Math.max(100, Math.round(parseFloat(data.currentWeightLbs) - 10)))
    : '175'
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">Where do you<br/>want to be?</h1>
        <p className="ob-q-sub">Set a goal weight to track your progress.</p>
      </div>
      <div className="ob-input-zone">
        <BigInput type="number" value={data.goalWeightLbs} onChange={v => patch({ goalWeightLbs: v })} placeholder={ph} unit="lbs" autoFocus />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={!data.goalWeightLbs}>Continue</button>
        <button className="ob-skip" onClick={onSkip}>Skip for now</button>
      </div>
    </StepShell>
  )
}

function StepHeight({ data, patch, onNext, onSkip, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">How tall<br/>are you?</h1>
      </div>
      <div className="ob-input-zone">
        <div className="ob-height-wrap">
          <select className="ob-height-select" value={data.heightFt} onChange={e => patch({ heightFt: e.target.value })}>
            <option value="">— ft</option>
            {[4, 5, 6, 7, 8].map(f => <option key={f} value={String(f)}>{f} ft</option>)}
          </select>
          <select className="ob-height-select" value={data.heightIn} onChange={e => patch({ heightIn: e.target.value })}>
            <option value="">— in</option>
            {Array.from({ length: 12 }, (_, i) => i).map(i => <option key={i} value={String(i)}>{i} in</option>)}
          </select>
        </div>
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={!data.heightFt}>Continue</button>
        <button className="ob-skip" onClick={onSkip}>Skip for now</button>
      </div>
    </StepShell>
  )
}

function StepAge({ data, patch, onNext, onSkip, dir }: StepProps) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">How old<br/>are you?</h1>
        <p className="ob-q-sub">Helps us personalize your baselines.</p>
      </div>
      <div className="ob-input-zone">
        <BigInput type="number" value={data.age} onChange={v => patch({ age: v })} placeholder="27" unit="yrs" autoFocus />
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={!data.age}>Continue</button>
        <button className="ob-skip" onClick={onSkip}>Skip for now</button>
      </div>
    </StepShell>
  )
}

function StepTrainingDays({ data, patch, onNext, dir }: Omit<StepProps, 'onSkip'>) {
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">How many days<br/>do you train?</h1>
        <p className="ob-q-sub">On average, per week.</p>
      </div>
      <div className="ob-input-zone">
        <div className="ob-day-selector">
          {[2, 3, 4, 5, 6, 7].map(d => (
            <button
              key={d}
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

function StepGoals({ data, patch, onNext, onSkip, dir }: StepProps) {
  const toggle = (id: string) => {
    const on = data.goals.includes(id)
    patch({ goals: on ? data.goals.filter(g => g !== id) : [...data.goals, id] })
  }
  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What matters<br/>most to you?</h1>
        <p className="ob-q-sub">Choose up to two.</p>
      </div>
      <div className="ob-goal-list">
        {GOAL_OPTIONS.map(g => {
          const on = data.goals.includes(g.id)
          return (
            <button key={g.id} className={`ob-goal-row ${on ? 'ob-goal-row--on' : ''}`} onClick={() => toggle(g.id)}>
              <span className="ob-goal-emoji">{g.emoji}</span>
              <span className="ob-goal-lbl">{g.label}</span>
              <span className={`ob-goal-dot ${on ? 'ob-goal-dot--on' : ''}`}><Check size={14} /></span>
            </button>
          )
        })}
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={data.goals.length === 0}>Continue</button>
        <button className="ob-skip" onClick={onSkip}>Skip for now</button>
      </div>
    </StepShell>
  )
}

function StepSources({ data, patch, onNext, dir }: Omit<StepProps, 'onSkip'>) {
  const platform = getPlatform()
  const sources = platform === 'ios' ? SOURCES_IOS : platform === 'android' ? SOURCES_ANDROID : SOURCES_DESKTOP

  const toggle = (id: string) => {
    const on = data.intendToConnect.includes(id)
    patch({ intendToConnect: on ? data.intendToConnect.filter(s => s !== id) : [...data.intendToConnect, id] })
  }

  return (
    <StepShell dir={dir}>
      <div className="ob-question">
        <h1 className="ob-q-title">What do<br/>you use?</h1>
        <p className="ob-q-sub">
          {platform === 'desktop'
            ? 'Wearable connections are easiest from your phone.'
            : "We'll help you connect when you're ready."}
        </p>
      </div>
      <div className="ob-source-list">
        {sources.map(s => {
          const isSoon = s.status === 'coming-soon'
          const on = !isSoon && data.intendToConnect.includes(s.id)
          const sl = SOURCE_STATUS[s.status]
          return (
            <button
              key={s.id}
              className={`ob-source-row ${on ? 'ob-source-row--on' : ''} ${isSoon ? 'ob-source-row--soon' : ''}`}
              onClick={() => !isSoon && toggle(s.id)}
              disabled={isSoon}
            >
              <span className="ob-source-icon">{s.emoji}</span>
              <div className="ob-source-info">
                <span className="ob-source-name">{s.name}</span>
                <span className="ob-source-desc">{s.desc}</span>
              </div>
              {on
                ? <span className="ob-source-check"><Check size={16} /></span>
                : <span className="ob-source-status" style={{ color: sl.color }}>{sl.text}</span>
              }
            </button>
          )
        })}
      </div>
      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>
          {data.intendToConnect.length > 0 ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </StepShell>
  )
}

// ─── Finish screen ────────────────────────────────────────────────────────────

function StepFinish({ data, onFinish, loading }: { data: OBData; onFinish: () => void; loading: boolean }) {
  const goalLbs = parseFloat(data.goalWeightLbs)
  const nutrition = !isNaN(goalLbs) && goalLbs > 0 ? calcNutrition(goalLbs, data.trainingDays) : null
  const goalLabels = GOAL_OPTIONS.filter(g => data.goals.includes(g.id)).map(g => g.label)

  return (
    <div className="ob-step ob-step--center">
      <div className="ob-finish-icon"><Check size={34} strokeWidth={3} /></div>
      <h1 className="ob-finish-title">
        {data.name.trim() ? `You're all set,\n${data.name.trim()}.` : "You're all set."}
      </h1>
      <p className="ob-finish-sub">Here's what we've set up for you.</p>

      <div className="ob-finish-card">
        {data.goalWeightLbs && (
          <div className="ob-finish-row">
            <span className="ob-finish-key">Goal weight</span>
            <span className="ob-finish-val">{data.goalWeightLbs} lbs</span>
          </div>
        )}
        {goalLabels.length > 0 && (
          <div className="ob-finish-row">
            <span className="ob-finish-key">Focus</span>
            <span className="ob-finish-val">{goalLabels.join(' · ')}</span>
          </div>
        )}
        <div className="ob-finish-row">
          <span className="ob-finish-key">Training</span>
          <span className="ob-finish-val">{data.trainingDays}× per week</span>
        </div>
        {nutrition && (
          <div className="ob-finish-row">
            <span className="ob-finish-key">Daily targets</span>
            <span className="ob-finish-val">{nutrition.calories} kcal · {nutrition.proteinG}g protein</span>
          </div>
        )}
      </div>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onFinish} disabled={loading}>
          {loading ? 'Setting up…' : 'Enter Shakthi Journal'}
        </button>
        <p className="ob-fine-print">Everything can be adjusted in Settings anytime.</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 8

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'fwd' | 'bwd'>('fwd')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<OBData>({
    name: '',
    currentWeightLbs: '',
    goalWeightLbs: '',
    heightFt: '5',
    heightIn: '10',
    age: '',
    trainingDays: 4,
    goals: [],
    intendToConnect: [],
  })

  function patch(u: Partial<OBData>) { setData(prev => ({ ...prev, ...u })) }

  function go(next: number) {
    setDir(next > step ? 'fwd' : 'bwd')
    setStep(next)
  }

  async function skipAll() {
    await setSetting('onboarding.completed', true)
    navigate('/', { replace: true })
  }

  async function handleFinish() {
    setLoading(true)
    try {
      const ft = parseInt(data.heightFt)
      const heightCm = !isNaN(ft) && ft > 0 ? Math.round(ft * 30.48 + (parseInt(data.heightIn) || 0) * 2.54) : undefined
      const today = new Date().toISOString().split('T')[0]

      if (data.name.trim()) {
        await saveProfile({
          name: data.name.trim(),
          heightCm,
          startDate: today,
          startWeightKg: data.currentWeightLbs ? +(parseFloat(data.currentWeightLbs) / 2.20462).toFixed(1) : undefined,
          goalWeightKg:  data.goalWeightLbs    ? +(parseFloat(data.goalWeightLbs)    / 2.20462).toFixed(1) : undefined,
          goalNotes: data.goals.join(', ') || undefined,
        })
      }

      const goalLbs = parseFloat(data.goalWeightLbs)
      if (!isNaN(goalLbs) && goalLbs > 0) {
        const nut = calcNutrition(goalLbs, data.trainingDays)
        await setSetting('nutrition-goals', { ...nut, macroFirstMode: false })
        await setSetting('nutrition.targets', { caloriesIn: nut.calories, proteinG: nut.proteinG, carbsG: nut.carbsG, fatG: nut.fatG, waterMl: nut.waterMl })
      }

      await setSetting('onboarding.completed', true)
      await setSetting('onboarding.goals', data.goals)
      await setSetting('onboarding.intendToConnect', data.intendToConnect)
      await setSetting('training.daysPerWeek', data.trainingDays)

      navigate('/', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  const showHeader = step > 0 && step < 9
  const progressPct = step > 0 ? Math.round(((step - 1) / TOTAL_STEPS) * 100) : 0
  const sp: StepProps = { data, patch, onNext: () => go(step + 1), onSkip: () => go(step + 1), dir }

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

      {step === 0 && (
        <div className="ob-step ob-step--center">
          <div className="ob-welcome-mark">S</div>
          <h1 className="ob-welcome-title">Shakthi Journal</h1>
          <p className="ob-welcome-sub">Let's personalize your experience.</p>
          <div className="ob-spacer" />
          <div className="ob-footer">
            <button className="ob-cta ob-cta--full" onClick={() => go(1)}>Get started</button>
            <button className="ob-skip" onClick={skipAll}>Continue as guest</button>
          </div>
        </div>
      )}

      {step === 1 && <StepName          key={1} {...sp} />}
      {step === 2 && <StepCurrentWeight key={2} {...sp} />}
      {step === 3 && <StepGoalWeight    key={3} {...sp} />}
      {step === 4 && <StepHeight        key={4} {...sp} />}
      {step === 5 && <StepAge           key={5} {...sp} />}
      {step === 6 && <StepTrainingDays  key={6} data={data} patch={patch} onNext={() => go(7)} dir={dir} />}
      {step === 7 && <StepGoals         key={7} {...sp} />}
      {step === 8 && <StepSources       key={8} data={data} patch={patch} onNext={() => go(9)} dir={dir} />}
      {step === 9 && <StepFinish data={data} onFinish={handleFinish} loading={loading} />}

    </div>
  )
}
