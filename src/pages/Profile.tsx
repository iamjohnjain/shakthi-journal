import { useState, useEffect, useRef } from 'react'
import {
  Watch, Radio, Scale, CheckCircle2, Pencil, X, Camera, Check,
  TrendingDown, Target, Flame, Calendar, Dumbbell,
} from 'lucide-react'
import { USER, kgToLbs, GOALS } from '../data/config'
import { useDashboardData } from '../hooks/useDashboardData'
import { getProfile, saveProfile } from '../db/profileStore'
import { getDBStats } from '../db'
import type { ProfileData } from '../db/profileStore'
import './Profile.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const GOALS_LIST = [
  'Lean athletic physique · visible abs year-round',
  'Dunk a basketball',
  'Complete a marathon',
  'Reach 12% body fat while maintaining muscle',
  'Increase vertical jump by 6"',
]

const ACTIVITIES = ['Lifting', 'Basketball', 'Volleyball', 'Running', 'Walking', 'StairMaster', 'Cycling', 'Mobility']

const DEVICES = [
  { name: 'Apple Watch', sub: 'Heart rate · steps · workouts · sleep', icon: Watch, status: 'via Apple Health' },
  { name: 'RingConn',    sub: 'HRV · sleep stages · recovery',         icon: Radio, status: 'via Apple Health' },
  { name: 'Renpho Smart Scale', sub: 'Weight · body composition',      icon: Scale, status: 'via Apple Health' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr?: string) {
  const start = new Date(dateStr ?? USER.startDate)
  const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
}

function cmToFeet(cm: number) {
  const totalIn = cm / 2.54
  return `${Math.floor(totalIn / 12)}′${Math.round(totalIn % 12)}″`
}

function clamp(v: number, lo = 0, hi = 100) { return Math.min(hi, Math.max(lo, v)) }

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  label, from, to, current, unit, colorGood = 'var(--green)', lowerIsBetter = false,
}: {
  label: string; from: number; to: number; current?: number
  unit: string; colorGood?: string; lowerIsBetter?: boolean
}) {
  if (current == null) return null
  const pctToGoal = lowerIsBetter
    ? clamp(Math.round((from - current) / (from - to) * 100))
    : clamp(Math.round((current - from) / (to - from) * 100))

  return (
    <div className="profile-progress-bar">
      <div className="profile-progress-labels">
        <span className="profile-progress-label">{label}</span>
        <span className="profile-progress-value" style={{ color: colorGood }}>{current}{unit}</span>
      </div>
      <div className="profile-progress-track">
        <div
          className="profile-progress-fill"
          style={{ width: `${pctToGoal}%`, background: colorGood }}
        />
      </div>
      <div className="profile-progress-from-to">
        <span>Start: {from}{unit}</span>
        <span className="profile-progress-pct">{pctToGoal}% to goal</span>
        <span>Goal: {to}{unit}</span>
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  initial: Partial<ProfileData>
  onClose: () => void
  onSave: (data: Omit<ProfileData, 'id' | 'updatedAt'>) => void
}

function EditModal({ initial, onClose, onSave }: EditModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name,           setName]           = useState(initial.name ?? USER.name)
  const [heightCm,       setHeightCm]       = useState(initial.heightCm ?? USER.heightCm)
  const [startDate,      setStartDate]      = useState(initial.startDate ?? USER.startDate)
  const [startWeightLbs, setStartWeightLbs] = useState(initial.startWeightKg ? kgToLbs(initial.startWeightKg) : 212)
  const [startBF,        setStartBF]        = useState(initial.startBodyFatPct ?? 19)
  const [goalWeightLbs,  setGoalWeightLbs]  = useState(initial.goalWeightKg ? kgToLbs(initial.goalWeightKg) : 185)
  const [goalBF,         setGoalBF]         = useState(initial.goalBodyFatPct ?? 12)
  const [goalNotes,      setGoalNotes]      = useState(initial.goalNotes ?? '')
  const [bio,            setBio]            = useState(initial.bio ?? 'Athlete in progress. Building toward a marathon, a dunk, and visible abs.')
  const [photo,          setPhoto]          = useState(initial.photoDataUrl ?? '')
  const [saving,         setSaving]         = useState(false)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhoto(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setSaving(true)
    await onSave({
      name,
      heightCm,
      startDate,
      startWeightKg: +(startWeightLbs / 2.20462).toFixed(2),
      startBodyFatPct: startBF,
      goalWeightKg: +(goalWeightLbs / 2.20462).toFixed(2),
      goalBodyFatPct: goalBF,
      goalNotes,
      bio,
      photoDataUrl: photo || undefined,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="profile-modal-header">
          <h2>Edit Profile</h2>
          <button className="profile-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="profile-modal-body">
          <div className="profile-edit-photo-row">
            <div className="profile-edit-avatar" onClick={() => fileRef.current?.click()}>
              {photo
                ? <img src={photo} alt="Profile" className="profile-edit-avatar-img" />
                : <span className="profile-edit-avatar-letter">{name[0]?.toUpperCase()}</span>
              }
              <div className="profile-edit-avatar-overlay"><Camera size={18} /></div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
            {photo && (
              <button className="profile-edit-remove-photo" onClick={() => setPhoto('')}>Remove photo</button>
            )}
          </div>

          <div className="profile-edit-grid">
            <div className="profile-edit-field">
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="profile-edit-field">
              <label>Height (cm)</label>
              <input type="number" value={heightCm} onChange={e => setHeightCm(Number(e.target.value))} />
            </div>
            <div className="profile-edit-field">
              <label>Tracking since</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="profile-edit-field">
              <label>Starting weight (lbs)</label>
              <input type="number" step="0.1" value={startWeightLbs} onChange={e => setStartWeightLbs(Number(e.target.value))} />
            </div>
            <div className="profile-edit-field">
              <label>Starting body fat %</label>
              <input type="number" step="0.1" min="3" max="60" value={startBF} onChange={e => setStartBF(Number(e.target.value))} />
            </div>
            <div className="profile-edit-field">
              <label>Goal weight (lbs)</label>
              <input type="number" step="0.1" value={goalWeightLbs} onChange={e => setGoalWeightLbs(Number(e.target.value))} />
            </div>
            <div className="profile-edit-field">
              <label>Goal body fat %</label>
              <input type="number" step="0.1" min="3" max="60" value={goalBF} onChange={e => setGoalBF(Number(e.target.value))} />
            </div>
          </div>

          <div className="profile-edit-field">
            <label>Goal notes</label>
            <input value={goalNotes} onChange={e => setGoalNotes(e.target.value)} placeholder="e.g. Run a marathon, visible abs year-round" />
          </div>
          <div className="profile-edit-field">
            <label>Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} />
          </div>
        </div>

        <div className="profile-modal-footer">
          <button className="profile-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="profile-modal-save" onClick={handleSave} disabled={saving}>
            <Check size={15} /> {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Profile() {
  const { today } = useDashboardData()
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [editing,     setEditing]     = useState(false)
  const [dbStats,     setDbStats]     = useState<{ workoutCount: number; logCount: number; nutritionCount: number } | null>(null)

  useEffect(() => {
    getProfile().then(setProfileData)
    getDBStats().then(s => setDbStats({ workoutCount: s.workoutCount, logCount: s.logCount, nutritionCount: s.nutritionCount }))
  }, [])

  async function handleSave(data: Omit<ProfileData, 'id' | 'updatedAt'>) {
    await saveProfile(data)
    const updated = await getProfile()
    setProfileData(updated)
  }

  const name     = profileData?.name ?? USER.name
  const bio      = profileData?.bio ?? 'Athlete in progress. Building toward a marathon, a dunk, and visible abs.'
  const heightCm = profileData?.heightCm ?? USER.heightCm
  const photo    = profileData?.photoDataUrl
  const days     = daysSince(profileData?.startDate)

  const startWeightLbs = profileData?.startWeightKg ? kgToLbs(profileData.startWeightKg) : 212
  const startBF        = profileData?.startBodyFatPct ?? 19
  const goalWeightLbs  = profileData?.goalWeightKg ? kgToLbs(profileData.goalWeightKg) : GOALS.targetWeightLbs
  const goalBF         = profileData?.goalBodyFatPct ?? GOALS.targetBodyFatPct
  const goalNotes      = profileData?.goalNotes

  const currentWeightLbs = today.weight ? kgToLbs(today.weight) : undefined
  const currentBF        = today.bodyFatPct

  const weightLost = currentWeightLbs != null ? +(startWeightLbs - currentWeightLbs).toFixed(1) : null
  const bfLost     = currentBF != null ? +(startBF - currentBF).toFixed(1) : null

  const milestones = [
    {
      icon: Calendar,
      color: 'var(--blue)',
      label: `${days} days tracked`,
      sub: `Since ${new Date((profileData?.startDate ?? USER.startDate) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    },
    ...(weightLost != null && weightLost > 0 ? [{
      icon: TrendingDown,
      color: 'var(--green)',
      label: `-${weightLost} lbs lost`,
      sub: `${startWeightLbs} → ${currentWeightLbs} lbs`,
    }] : []),
    ...(bfLost != null && bfLost > 0 ? [{
      icon: Target,
      color: 'var(--orange)',
      label: `-${bfLost}% body fat`,
      sub: `${startBF}% → ${currentBF?.toFixed(1)}%`,
    }] : []),
    ...(dbStats?.workoutCount ? [{
      icon: Dumbbell,
      color: 'var(--purple)',
      label: `${dbStats.workoutCount} workouts`,
      sub: 'Logged in Shakthi',
    }] : []),
    ...(dbStats?.logCount ? [{
      icon: Flame,
      color: 'var(--red)',
      label: `${dbStats.logCount} daily logs`,
      sub: 'Consistency is everything',
    }] : []),
  ]

  return (
    <div className="profile-page">

      {editing && (
        <EditModal
          initial={profileData ?? {}}
          onClose={() => setEditing(false)}
          onSave={handleSave}
        />
      )}

      {/* ── Hero ── */}
      <section className="profile-hero">
        <div className="profile-hero-bg" />
        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            {photo
              ? <img src={photo} alt={name} className="profile-avatar profile-avatar--photo" />
              : <div className="profile-avatar">{name[0]?.toUpperCase()}</div>
            }
            <button className="profile-avatar-edit-btn" onClick={() => setEditing(true)}>
              <Camera size={14} />
            </button>
          </div>
          <h1 className="profile-name">{name}</h1>
          <p className="profile-bio">{bio}</p>
          <div className="profile-meta-row">
            <span className="profile-meta-chip">{cmToFeet(heightCm)}</span>
            {currentWeightLbs && <span className="profile-meta-chip">{currentWeightLbs} lbs</span>}
            <span className="profile-meta-chip">{USER.gender}</span>
            <span className="profile-meta-chip">Age {new Date().getFullYear() - USER.birthYear}</span>
          </div>
        </div>
        <button className="profile-edit-btn" onClick={() => setEditing(true)}>
          <Pencil size={13} /> Edit
        </button>
      </section>

      {/* ── Milestone strip ── */}
      {milestones.length > 0 && (
        <div className="profile-milestones">
          {milestones.map((m, i) => (
            <div key={i} className="profile-milestone">
              <div className="profile-milestone-icon" style={{ background: `color-mix(in srgb, ${m.color} 15%, transparent)`, color: m.color }}>
                <m.icon size={16} />
              </div>
              <div className="profile-milestone-text">
                <span className="profile-milestone-label">{m.label}</span>
                <span className="profile-milestone-sub">{m.sub}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="profile-content">

        {/* ── Progress toward goals ── */}
        <section className="profile-card">
          <h2 className="profile-card-title">Progress Toward Goals</h2>
          {currentWeightLbs != null && (
            <ProgressBar
              label="Weight"
              from={startWeightLbs}
              to={goalWeightLbs}
              current={currentWeightLbs}
              unit=" lbs"
              lowerIsBetter={startWeightLbs > goalWeightLbs}
              colorGood="var(--blue)"
            />
          )}
          {currentBF != null && (
            <ProgressBar
              label="Body Fat"
              from={startBF}
              to={goalBF}
              current={parseFloat(currentBF.toFixed(1))}
              unit="%"
              lowerIsBetter
              colorGood="var(--green)"
            />
          )}
          {currentWeightLbs == null && currentBF == null && (
            <p className="profile-no-data">Import Apple Health data or log your weight to see progress.</p>
          )}
          {goalNotes && <p className="profile-goal-notes">🎯 {goalNotes}</p>}
        </section>

        {/* ── Baseline ── */}
        <section className="profile-card">
          <h2 className="profile-card-title">Starting Baseline</h2>
          <div className="profile-baseline-grid">
            <div className="profile-baseline-item">
              <span className="profile-baseline-val">{startWeightLbs} lbs</span>
              <span className="profile-baseline-label">Start weight</span>
            </div>
            <div className="profile-baseline-item">
              <span className="profile-baseline-val">{startBF}%</span>
              <span className="profile-baseline-label">Start body fat</span>
            </div>
            <div className="profile-baseline-item">
              <span className="profile-baseline-val" style={{ color: 'var(--blue)' }}>{goalWeightLbs} lbs</span>
              <span className="profile-baseline-label">Goal weight</span>
            </div>
            <div className="profile-baseline-item">
              <span className="profile-baseline-val" style={{ color: 'var(--blue)' }}>{goalBF}%</span>
              <span className="profile-baseline-label">Goal body fat</span>
            </div>
          </div>
        </section>

        {/* ── Primary Goals ── */}
        <section className="profile-card">
          <h2 className="profile-card-title">Primary Goals</h2>
          <ul className="profile-goals-list">
            {GOALS_LIST.map(g => (
              <li key={g} className="profile-goal-item">
                <CheckCircle2 size={15} className="profile-goal-icon" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Activities ── */}
        <section className="profile-card">
          <h2 className="profile-card-title">Favorite Activities</h2>
          <div className="profile-activity-chips">
            {ACTIVITIES.map(a => (
              <span key={a} className="profile-activity-chip">{a}</span>
            ))}
          </div>
        </section>

        {/* ── Connected Devices ── */}
        <section className="profile-card">
          <h2 className="profile-card-title">Connected Devices</h2>
          <div className="profile-devices-list">
            {DEVICES.map(d => (
              <div key={d.name} className="profile-device-row">
                <div className="profile-device-icon-wrap">
                  <d.icon size={18} />
                </div>
                <div className="profile-device-info">
                  <span className="profile-device-name">{d.name}</span>
                  <span className="profile-device-sub">{d.sub}</span>
                </div>
                <span className="profile-device-status">{d.status}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
