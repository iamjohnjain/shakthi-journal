import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { saveProfile } from '../db/profileStore'
import { setSetting } from '../db'
import './OnboardingPage.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { id: 'visible-abs',    emoji: '💪', label: 'Visible abs' },
  { id: 'fat-loss',       emoji: '🔥', label: 'Fat loss' },
  { id: 'muscle-gain',    emoji: '🏋️', label: 'Muscle gain' },
  { id: 'strength',       emoji: '⚡', label: 'Strength' },
  { id: 'jump-higher',    emoji: '🏀', label: 'Jump higher / Dunk' },
  { id: 'running',        emoji: '🏃', label: 'Running endurance' },
  { id: 'general-health', emoji: '❤️', label: 'General health' },
]

const EQUIPMENT_OPTIONS = [
  { id: 'full-gym',         label: 'Full gym' },
  { id: 'home-gym',         label: 'Home gym setup' },
  { id: 'barbell',          label: 'Barbell + rack' },
  { id: 'dumbbells',        label: 'Dumbbells only' },
  { id: 'resistance-bands', label: 'Resistance bands' },
  { id: 'bodyweight',       label: 'Bodyweight only' },
]

const SOURCE_OPTIONS = [
  { id: 'apple-health', icon: '🍎', name: 'Apple Health / Watch',  status: 'import-ready', desc: 'Export & import from the Health app' },
  { id: 'renpho',       icon: '⚖️', name: 'RENPHO Scale',          status: 'import-ready', desc: 'Export CSV from the RENPHO app' },
  { id: 'strava',       icon: '🚴', name: 'Strava',                status: 'connect',       desc: 'Connect via OAuth in Settings' },
  { id: 'ringconn',     icon: '💍', name: 'RingConn',              status: 'via-health',    desc: 'Syncs to Apple Health automatically' },
  { id: 'myfitnesspal', icon: '🥗', name: 'MyFitnessPal',          status: 'import-ready', desc: 'Export CSV from myfitnesspal.com' },
  { id: 'garmin',       icon: '⌚', name: 'Garmin',               status: 'coming-soon',   desc: 'Use Garmin → Apple Health sync for now' },
  { id: 'whoop',        icon: '⚡', name: 'WHOOP',                status: 'coming-soon',   desc: 'Use WHOOP → Apple Health sync for now' },
  { id: 'oura',         icon: '🌙', name: 'Oura Ring',            status: 'coming-soon',   desc: 'Use Oura → Apple Health sync for now' },
]

const STATUS_LABEL: Record<string, string> = {
  'import-ready': 'Import ready',
  'connect':      'Connect later',
  'via-health':   'Via Apple Health',
  'import-ready2':'CSV export',
  'coming-soon':  'Coming soon',
}
const STATUS_COLOR: Record<string, string> = {
  'import-ready': 'var(--green)',
  'connect':      'var(--blue)',
  'via-health':   'var(--teal)',
  'coming-soon':  'var(--text-tertiary)',
}

const TOTAL_STEPS = 8

// ─── Data shape ───────────────────────────────────────────────────────────────

interface OBData {
  name: string
  birthday: string
  heightFt: string
  heightIn: string
  sex: string
  currentWeightLbs: string
  goalWeightLbs: string
  bodyFatPct: string
  restingHR: string
  hrv: string
  goals: string[]
  trainingDays: number
  sessionMin: number
  equipment: string[]
  useRecommended: boolean
  calories: string
  protein: string
  carbs: string
  fat: string
  intendToConnect: string[]
}

const DEFAULTS: OBData = {
  name: '', birthday: '', heightFt: '5', heightIn: '10', sex: '',
  currentWeightLbs: '', goalWeightLbs: '',
  bodyFatPct: '', restingHR: '', hrv: '',
  goals: ['fat-loss', 'muscle-gain'],
  trainingDays: 4, sessionMin: 60,
  equipment: ['full-gym'],
  useRecommended: true, calories: '', protein: '', carbs: '', fat: '',
  intendToConnect: [],
}

// ─── Nutrition formula ────────────────────────────────────────────────────────

function calcNutrition(goalWeightLbs: string, goals: string[]) {
  const gw = parseFloat(goalWeightLbs) || 180
  const isFatLoss = goals.includes('fat-loss') && !goals.includes('muscle-gain')
  const protein = Math.round(gw * 0.8)
  const calories = isFatLoss ? Math.round(gw * 12) : Math.round(gw * 15)
  const fat = Math.round((calories * 0.25) / 9)
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))
  return { calories: String(calories), protein: String(protein), carbs: String(carbs), fat: String(fat) }
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep]   = useState(1)
  const [data, setData]   = useState<OBData>(DEFAULTS)
  const [saving, setSaving] = useState(false)

  function patch(updates: Partial<OBData>) {
    setData(d => ({ ...d, ...updates }))
  }

  function toggle(key: 'goals' | 'equipment' | 'intendToConnect', val: string) {
    setData(d => {
      const arr = d[key]
      return { ...d, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })
  }

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)) }
  function back() { setStep(s => Math.max(s - 1, 1)) }

  // Recalculate recommended nutrition when arriving at step 6
  useEffect(() => {
    if (step === 6 && data.useRecommended) {
      const rec = calcNutrition(data.goalWeightLbs, data.goals)
      setData(d => ({ ...d, ...rec }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function skip() {
    await setSetting('onboarding.completed', true)
    navigate('/', { replace: true })
  }

  async function finish() {
    setSaving(true)
    try {
      const totalIn   = parseFloat(data.heightFt) * 12 + parseFloat(data.heightIn)
      const heightCm  = isNaN(totalIn) ? undefined : Math.round(totalIn * 2.54)
      const startWt   = parseFloat(data.currentWeightLbs) / 2.205
      const goalWt    = parseFloat(data.goalWeightLbs) / 2.205
      const bf        = parseFloat(data.bodyFatPct)

      await saveProfile({
        name:             data.name || 'Athlete',
        heightCm,
        startDate:        new Date().toISOString().slice(0, 10),
        startWeightKg:    isNaN(startWt) ? undefined : +startWt.toFixed(1),
        goalWeightKg:     isNaN(goalWt)  ? undefined : +goalWt.toFixed(1),
        startBodyFatPct:  isNaN(bf)      ? undefined : bf,
        goalNotes:        data.goals.join(', '),
      })

      const nutrition = data.useRecommended
        ? calcNutrition(data.goalWeightLbs, data.goals)
        : { calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat }

      await Promise.all([
        setSetting('onboarding.completed', true),
        setSetting('onboarding.goals', data.goals),
        setSetting('onboarding.intendToConnect', data.intendToConnect),
        setSetting('training.daysPerWeek', data.trainingDays),
        setSetting('training.sessionMin', data.sessionMin),
        setSetting('training.equipment', data.equipment),
        setSetting('nutrition.targets', {
          caloriesIn: parseInt(nutrition.calories) || 2200,
          proteinG:   parseInt(nutrition.protein)  || 180,
          carbsG:     parseInt(nutrition.carbs)    || 200,
          fatG:       parseInt(nutrition.fat)      || 60,
          waterMl:    3785,
        }),
      ])

      navigate('/', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100

  return (
    <div className="ob-page">
      <header className="ob-header">
        {step > 1
          ? <button className="ob-nav-btn" onClick={back} aria-label="Back">←</button>
          : <div className="ob-nav-btn" />
        }
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <button className="ob-nav-btn ob-nav-btn--skip" onClick={skip}>Skip</button>
      </header>

      <div className="ob-body">
        {step === 1 && <StepWelcome onNext={next} />}
        {step === 2 && <StepProfile    data={data} patch={patch} onNext={next} />}
        {step === 3 && <StepMetrics    data={data} patch={patch} onNext={next} />}
        {step === 4 && <StepGoals      data={data} toggle={v => toggle('goals', v)} onNext={next} />}
        {step === 5 && <StepTraining   data={data} patch={patch} toggle={v => toggle('equipment', v)} onNext={next} />}
        {step === 6 && <StepNutrition  data={data} patch={patch} onNext={next} />}
        {step === 7 && <StepSources    data={data} toggle={v => toggle('intendToConnect', v)} onNext={next} />}
        {step === 8 && <StepFinish     data={data} saving={saving} onFinish={finish} />}
      </div>
    </div>
  )
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="ob-step ob-step--center">
      <img src="/icon.svg" className="ob-logo" alt="" aria-hidden="true" />
      <h1 className="ob-hero-title">Welcome to<br />Shakthi Journal</h1>
      <p className="ob-hero-desc">Your personal health OS.<br />Private by default. Built for athletes.</p>
      <div className="ob-spacer" />
      <button className="ob-cta" onClick={onNext}>
        Get Started <ChevronRight size={18} strokeWidth={2.5} />
      </button>
      <p className="ob-fine-print">Takes about 2 minutes · everything is optional</p>
    </div>
  )
}

// ─── Step 2: Profile ─────────────────────────────────────────────────────────

function StepProfile({ data, patch, onNext }: {
  data: OBData
  patch: (u: Partial<OBData>) => void
  onNext: () => void
}) {
  return (
    <div className="ob-step">
      <h2 className="ob-step-title">About you</h2>
      <p className="ob-step-subtitle">Used to personalize your recommendations.</p>

      <div className="ob-fields">
        <label className="ob-label">Your name</label>
        <input className="ob-input" type="text" placeholder="First name" autoComplete="given-name"
          value={data.name} onChange={e => patch({ name: e.target.value })} />

        <label className="ob-label">Birthday <span className="ob-optional">(optional)</span></label>
        <input className="ob-input" type="date" value={data.birthday}
          onChange={e => patch({ birthday: e.target.value })} />

        <label className="ob-label">Height</label>
        <div className="ob-row-2">
          <div className="ob-input-unit">
            <input className="ob-input" type="number" min="4" max="8" placeholder="5"
              value={data.heightFt} onChange={e => patch({ heightFt: e.target.value })} />
            <span>ft</span>
          </div>
          <div className="ob-input-unit">
            <input className="ob-input" type="number" min="0" max="11" placeholder="10"
              value={data.heightIn} onChange={e => patch({ heightIn: e.target.value })} />
            <span>in</span>
          </div>
        </div>

        <label className="ob-label">Sex <span className="ob-optional">(optional)</span></label>
        <div className="ob-pill-row">
          {(['Male', 'Female', 'Other', 'Prefer not to say'] as const).map(s => {
            const val = s === 'Prefer not to say' ? '' : s.toLowerCase()
            return (
              <button key={s}
                className={`ob-pill ${data.sex === val ? 'ob-pill--on' : ''}`}
                onClick={() => patch({ sex: val })}>
                {s}
              </button>
            )
          })}
        </div>
      </div>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
      </div>
    </div>
  )
}

// ─── Step 3: Current Metrics ─────────────────────────────────────────────────

function StepMetrics({ data, patch, onNext }: {
  data: OBData
  patch: (u: Partial<OBData>) => void
  onNext: () => void
}) {
  return (
    <div className="ob-step">
      <h2 className="ob-step-title">Starting point</h2>
      <p className="ob-step-subtitle">Fill in what you know — everything is optional.</p>

      <div className="ob-fields">
        <div className="ob-row-2">
          <div>
            <label className="ob-label">Current weight</label>
            <div className="ob-input-unit">
              <input className="ob-input" type="number" placeholder="185"
                value={data.currentWeightLbs} onChange={e => patch({ currentWeightLbs: e.target.value })} />
              <span>lbs</span>
            </div>
          </div>
          <div>
            <label className="ob-label">Goal weight</label>
            <div className="ob-input-unit">
              <input className="ob-input" type="number" placeholder="175"
                value={data.goalWeightLbs} onChange={e => patch({ goalWeightLbs: e.target.value })} />
              <span>lbs</span>
            </div>
          </div>
        </div>

        <div className="ob-row-2">
          <div>
            <label className="ob-label">Body fat %</label>
            <div className="ob-input-unit">
              <input className="ob-input" type="number" placeholder="18"
                value={data.bodyFatPct} onChange={e => patch({ bodyFatPct: e.target.value })} />
              <span>%</span>
            </div>
          </div>
          <div>
            <label className="ob-label">Resting HR</label>
            <div className="ob-input-unit">
              <input className="ob-input" type="number" placeholder="60"
                value={data.restingHR} onChange={e => patch({ restingHR: e.target.value })} />
              <span>bpm</span>
            </div>
          </div>
        </div>

        <label className="ob-label">HRV (morning avg) <span className="ob-optional">optional</span></label>
        <div className="ob-input-unit ob-input-unit--narrow">
          <input className="ob-input" type="number" placeholder="55"
            value={data.hrv} onChange={e => patch({ hrv: e.target.value })} />
          <span>ms</span>
        </div>
      </div>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
      </div>
    </div>
  )
}

// ─── Step 4: Goals ───────────────────────────────────────────────────────────

function StepGoals({ data, toggle, onNext }: {
  data: OBData
  toggle: (id: string) => void
  onNext: () => void
}) {
  return (
    <div className="ob-step">
      <h2 className="ob-step-title">Your goals</h2>
      <p className="ob-step-subtitle">Select all that apply.</p>

      <div className="ob-goal-grid">
        {GOAL_OPTIONS.map(g => {
          const on = data.goals.includes(g.id)
          return (
            <button key={g.id} className={`ob-goal-card ${on ? 'ob-goal-card--on' : ''}`} onClick={() => toggle(g.id)}>
              <span className="ob-goal-emoji">{g.emoji}</span>
              <span className="ob-goal-label">{g.label}</span>
              {on && <Check size={13} className="ob-goal-check" />}
            </button>
          )
        })}
      </div>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext} disabled={data.goals.length === 0}>
          Continue {data.goals.length > 0 && `· ${data.goals.length} selected`}
        </button>
      </div>
    </div>
  )
}

// ─── Step 5: Training ────────────────────────────────────────────────────────

function StepTraining({ data, patch, toggle, onNext }: {
  data: OBData
  patch: (u: Partial<OBData>) => void
  toggle: (id: string) => void
  onNext: () => void
}) {
  return (
    <div className="ob-step">
      <h2 className="ob-step-title">Training schedule</h2>
      <p className="ob-step-subtitle">We'll tailor plans to fit your availability.</p>

      <div className="ob-fields">
        <label className="ob-label">Days per week</label>
        <div className="ob-day-picker">
          {[2, 3, 4, 5, 6, 7].map(d => (
            <button key={d}
              className={`ob-day-btn ${data.trainingDays === d ? 'ob-day-btn--on' : ''}`}
              onClick={() => patch({ trainingDays: d })}>
              {d}
            </button>
          ))}
        </div>

        <label className="ob-label">Session length</label>
        <div className="ob-pill-row">
          {[30, 45, 60, 75, 90].map(m => (
            <button key={m}
              className={`ob-pill ${data.sessionMin === m ? 'ob-pill--on' : ''}`}
              onClick={() => patch({ sessionMin: m })}>
              {m} min
            </button>
          ))}
        </div>

        <label className="ob-label">Equipment available</label>
        <div className="ob-chip-grid">
          {EQUIPMENT_OPTIONS.map(e => (
            <button key={e.id}
              className={`ob-chip ${data.equipment.includes(e.id) ? 'ob-chip--on' : ''}`}
              onClick={() => toggle(e.id)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
      </div>
    </div>
  )
}

// ─── Step 6: Nutrition ───────────────────────────────────────────────────────

function StepNutrition({ data, patch, onNext }: {
  data: OBData
  patch: (u: Partial<OBData>) => void
  onNext: () => void
}) {
  function switchMode(rec: boolean) {
    if (rec) {
      const calc = calcNutrition(data.goalWeightLbs, data.goals)
      patch({ useRecommended: true, ...calc })
    } else {
      patch({ useRecommended: false })
    }
  }

  return (
    <div className="ob-step">
      <h2 className="ob-step-title">Nutrition targets</h2>
      <p className="ob-step-subtitle">Daily macros. You can adjust these in Settings later.</p>

      <div className="ob-toggle-pair">
        <button className={`ob-toggle-btn ${data.useRecommended ? 'ob-toggle-btn--on' : ''}`}
          onClick={() => switchMode(true)}>
          Use recommended
        </button>
        <button className={`ob-toggle-btn ${!data.useRecommended ? 'ob-toggle-btn--on' : ''}`}
          onClick={() => switchMode(false)}>
          Set manually
        </button>
      </div>

      <div className="ob-macro-grid">
        {([
          { key: 'calories', label: 'Calories', unit: 'kcal', color: 'var(--blue)',   placeholder: '2200' },
          { key: 'protein',  label: 'Protein',  unit: 'g',    color: 'var(--green)',  placeholder: '180'  },
          { key: 'carbs',    label: 'Carbs',    unit: 'g',    color: 'var(--orange)', placeholder: '200'  },
          { key: 'fat',      label: 'Fat',      unit: 'g',    color: 'var(--yellow)', placeholder: '60'   },
        ] as const).map(m => (
          <div key={m.key} className="ob-macro-card">
            <span className="ob-macro-label">{m.label}</span>
            {data.useRecommended
              ? <span className="ob-macro-val" style={{ color: m.color }}>{data[m.key] || '—'}</span>
              : <input className="ob-macro-input" type="number" placeholder={m.placeholder}
                  value={data[m.key]}
                  onChange={e => patch({ [m.key]: e.target.value } as Partial<OBData>)} />
            }
            <span className="ob-macro-unit">{m.unit}</span>
          </div>
        ))}
      </div>

      {data.useRecommended && (
        <p className="ob-nutrition-note">
          Based on {data.goalWeightLbs ? `${data.goalWeightLbs} lbs goal weight` : 'estimated goal weight'}
          {' '}· 0.8g protein per lb · {data.goals.includes('fat-loss') && !data.goals.includes('muscle-gain') ? 'fat loss deficit' : 'maintenance/growth'}
        </p>
      )}

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
      </div>
    </div>
  )
}

// ─── Step 7: Sources ─────────────────────────────────────────────────────────

function StepSources({ data, toggle, onNext }: {
  data: OBData
  toggle: (id: string) => void
  onNext: () => void
}) {
  return (
    <div className="ob-step">
      <h2 className="ob-step-title">Connect your devices</h2>
      <p className="ob-step-subtitle">Mark what you plan to use — you'll connect them after setup.</p>

      <div className="ob-source-list">
        {SOURCE_OPTIONS.map(s => {
          const on = data.intendToConnect.includes(s.id)
          return (
            <button key={s.id} className={`ob-source-row ${on ? 'ob-source-row--on' : ''}`}
              onClick={() => toggle(s.id)}>
              <span className="ob-source-icon">{s.icon}</span>
              <div className="ob-source-info">
                <span className="ob-source-name">{s.name}</span>
                <span className="ob-source-desc">{s.desc}</span>
              </div>
              <span className="ob-source-status" style={{ color: STATUS_COLOR[s.status] ?? 'var(--text-tertiary)' }}>
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
              {on && <Check size={14} className="ob-source-check" />}
            </button>
          )
        })}
      </div>

      <div className="ob-footer">
        <button className="ob-cta ob-cta--full" onClick={onNext}>Continue</button>
        <p className="ob-fine-print">Connect or import via Settings → Connected Accounts</p>
      </div>
    </div>
  )
}

// ─── Step 8: Finish ──────────────────────────────────────────────────────────

function StepFinish({ data, saving, onFinish }: {
  data: OBData
  saving: boolean
  onFinish: () => void
}) {
  return (
    <div className="ob-step ob-step--center">
      <div className="ob-finish-emoji">🎯</div>
      <h2 className="ob-hero-title">
        You're set{data.name ? `, ${data.name}` : ''}!
      </h2>
      <p className="ob-hero-desc">Your health OS is ready. Start by logging today or importing your Apple Health data.</p>

      <div className="ob-summary">
        {data.goals.length > 0 && (
          <div className="ob-summary-row">
            <span className="ob-summary-key">Goals</span>
            <span className="ob-summary-val">
              {data.goals
                .map(id => GOAL_OPTIONS.find(o => o.id === id)?.label)
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        {data.goalWeightLbs && (
          <div className="ob-summary-row">
            <span className="ob-summary-key">Goal weight</span>
            <span className="ob-summary-val">{data.goalWeightLbs} lbs</span>
          </div>
        )}
        {data.protein && (
          <div className="ob-summary-row">
            <span className="ob-summary-key">Daily protein</span>
            <span className="ob-summary-val">{data.protein}g · {data.calories} kcal</span>
          </div>
        )}
        <div className="ob-summary-row">
          <span className="ob-summary-key">Training</span>
          <span className="ob-summary-val">{data.trainingDays}× / week · {data.sessionMin} min</span>
        </div>
        {data.intendToConnect.length > 0 && (
          <div className="ob-summary-row">
            <span className="ob-summary-key">Plan to connect</span>
            <span className="ob-summary-val">
              {data.intendToConnect
                .map(id => SOURCE_OPTIONS.find(s => s.id === id)?.name)
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        )}
      </div>

      <div className="ob-spacer" />
      <button className="ob-cta ob-cta--full" onClick={onFinish} disabled={saving}>
        {saving ? 'Saving…' : 'Enter Shakthi Journal →'}
      </button>
    </div>
  )
}
