import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Watch, Radio, Scale, CheckCircle2, Pencil, X, Camera, Check,
  TrendingDown, Target, Flame, Calendar, Dumbbell, Settings, LogIn, LogOut, Sparkles,
} from 'lucide-react'
import { kgToLbs, localDateStr } from '../data/config'
import { useUnits } from '../hooks/useUnits'
import { useDashboardData } from '../hooks/useDashboardData'
import { getProfile, saveProfile } from '../db/profileStore'
import { getDBStats } from '../db'
import type { ProfileData } from '../db/profileStore'
import type { WeeklyReview } from '../db'
import { getAllWeeklyReviews } from '../db/reviewStore'
import { AvatarDisplay, AvatarPicker } from '../components/Avatar'
import WeeklyWrapCard from '../components/WeeklyWrapCard'
import { useAuth } from '../context/AuthContext'
import { getOwnedDevices, owns } from '../db/deviceStore'
import type { DeviceId } from '../db/deviceStore'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { PRIMARY_GOALS } from './OnboardingPage'
import './Profile.css'

const GOAL_LABEL: Record<string, string> = Object.fromEntries(PRIMARY_GOALS.map(g => [g.id, g.label]))
function goalLabel(id: string): string { return GOAL_LABEL[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICES: Array<{ id: DeviceId; name: string; sub: string; icon: typeof Watch; status: string }> = [
  { id: 'apple_watch', name: 'Apple Watch', sub: 'Heart rate · steps · workouts · sleep', icon: Watch, status: 'via Apple Health' },
  { id: 'ringconn',    name: 'RingConn',    sub: 'HRV · sleep stages · recovery',         icon: Radio, status: 'via Apple Health' },
  { id: 'renpho',      name: 'Renpho Smart Scale', sub: 'Weight · body composition',      icon: Scale, status: 'via Apple Health' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr?: string) {
  if (!dateStr) return null
  const start = new Date(dateStr)
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
  const units = useUnits()
  const [name,           setName]           = useState(initial.name ?? '')
  const [heightCm,       setHeightCm]       = useState<number | ''>(initial.heightCm ?? '')
  const [heightFt,       setHeightFt]       = useState<number | ''>(initial.heightCm ? Math.floor(initial.heightCm / 30.48) : '')
  const [heightIn,       setHeightIn]       = useState<number | ''>(
    initial.heightCm ? Math.round((initial.heightCm - Math.floor(initial.heightCm / 30.48) * 30.48) / 2.54) : ''
  )
  const [startDate,      setStartDate]      = useState(initial.startDate ?? '')
  const isMetric = units.system === 'metric'
  const toW = (kg: number) => isMetric ? +kg.toFixed(1) : kgToLbs(kg)
  const fromW = (v: number) => isMetric ? v : +(v / 2.20462).toFixed(2)
  const [startWeightLbs, setStartWeightLbs] = useState<number | ''>(initial.startWeightKg ? toW(initial.startWeightKg) : '')
  const [startBF,        setStartBF]        = useState<number | ''>(initial.startBodyFatPct ?? '')
  const [goalWeightLbs,  setGoalWeightLbs]  = useState<number | ''>(initial.goalWeightKg ? toW(initial.goalWeightKg) : '')
  const [goalBF,         setGoalBF]         = useState<number | ''>(initial.goalBodyFatPct ?? '')
  const [goalNotes,      setGoalNotes]      = useState(initial.goalNotes ?? '')

  // useUnits() loads the saved unit system asynchronously, so `isMetric` can
  // flip from its 'us-hybrid' default to 'metric' after this modal has
  // already mounted and converted the initial weight values for display —
  // re-convert once the real setting lands so the fields don't show a stale
  // lbs-based figure under a "(kg)" label.
  useEffect(() => {
    if (initial.startWeightKg != null) setStartWeightLbs(toW(initial.startWeightKg))
    if (initial.goalWeightKg != null)  setGoalWeightLbs(toW(initial.goalWeightKg))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.system])
  const [bio,            setBio]            = useState(initial.bio ?? '')
  const [dob,            setDob]            = useState(initial.dob ?? '')
  const [photo,          setPhoto]          = useState(initial.photoDataUrl ?? '')
  const [avatarId,       setAvatarId]       = useState<string | undefined>(initial.avatarId)
  const [saving,         setSaving]         = useState(false)
  // The avatar grid only needs to be on-screen when there's an actual choice
  // to make — a fresh profile with nothing selected yet, or right after the
  // user taps the photo's "x" and picks "Choose an avatar". Otherwise it's
  // six icons taking up space next to a photo/avatar the person already set.
  const [showAvatarPicker, setShowAvatarPicker] = useState(!initial.photoDataUrl && !initial.avatarId)
  const [showPhotoMenu,    setShowPhotoMenu]    = useState(false)

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setPhoto(ev.target?.result as string); setAvatarId(undefined); setShowAvatarPicker(false) }
    reader.readAsDataURL(file)
  }

  function handleAvatarSelect(id: string | undefined) {
    setAvatarId(id)
    if (id) { setPhoto(''); setShowAvatarPicker(false) } // animal avatar overrides photo
  }

  const heightCmToSave = units.height === 'cm'
    ? (heightCm !== '' ? Number(heightCm) : undefined)
    : (heightFt !== '' ? Math.round(Number(heightFt) * 30.48 + (heightIn !== '' ? Number(heightIn) : 0) * 2.54) : undefined)

  async function handleSave() {
    setSaving(true)
    await onSave({
      // Preserve fields this form doesn't manage (goalDate, sex, activityLevel,
      // etc.) — without this spread, saving here would silently wipe them,
      // since onSave replaces the whole profile rather than merging into it.
      ...initial,
      name: name.trim() || 'User',
      heightCm: heightCmToSave,
      startDate: startDate || undefined,
      dob: dob || undefined,
      startWeightKg: startWeightLbs !== '' ? fromW(Number(startWeightLbs)) : undefined,
      startBodyFatPct: startBF !== '' ? Number(startBF) : undefined,
      goalWeightKg: goalWeightLbs !== '' ? fromW(Number(goalWeightLbs)) : undefined,
      goalBodyFatPct: goalBF !== '' ? Number(goalBF) : undefined,
      goalNotes,
      bio,
      photoDataUrl: photo || undefined,
      avatarId,
    })
    setSaving(false)
    onClose()
  }

  return createPortal(
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="profile-modal-header" {...swipe.handlers}>
          <div className="modal-grabber" />
          <h2>Edit Profile</h2>
          <button className="profile-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="profile-modal-body">
          {/* Avatar / Photo selection */}
          <div className="profile-edit-photo-row">
            <div className="profile-edit-avatar-wrap">
              <div
                className="profile-edit-avatar"
                onClick={() => { if (!photo && !avatarId) fileRef.current?.click() }}
              >
                {photo
                  ? <img src={photo} alt="Profile" className="profile-edit-avatar-img" />
                  : <AvatarDisplay name={name} avatarId={avatarId} size="lg" />
                }
                {!photo && !avatarId && <div className="profile-edit-avatar-overlay"><Camera size={18} /></div>}
              </div>
              {(photo || avatarId) && (
                <button className="profile-edit-avatar-x" onClick={() => setShowPhotoMenu(true)} aria-label="Change photo">
                  <X size={14} />
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
            {!photo && !avatarId && (
              <button className="profile-edit-upload-btn" onClick={() => fileRef.current?.click()}>Upload photo</button>
            )}
          </div>

          {showPhotoMenu && (
            <div className="profile-photo-menu">
              <button onClick={() => { setPhoto(''); setAvatarId(undefined); setShowAvatarPicker(true); setShowPhotoMenu(false) }}>
                Choose an avatar
              </button>
              <button onClick={() => { fileRef.current?.click(); setShowPhotoMenu(false) }}>
                Upload a different photo
              </button>
              <button className="profile-photo-menu-cancel" onClick={() => setShowPhotoMenu(false)}>Cancel</button>
            </div>
          )}

          {showAvatarPicker && <AvatarPicker selectedId={avatarId} onSelect={handleAvatarSelect} />}

          <div className="profile-edit-grid">
            <div className="profile-edit-field">
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="profile-edit-field">
              {units.height === 'cm' ? (
                <>
                  <label>Height (cm)</label>
                  <input type="number" inputMode="numeric" value={heightCm} onChange={e => setHeightCm(e.target.value === '' ? '' : Number(e.target.value))} />
                </>
              ) : (
                <>
                  <label>Height (ft/in)</label>
                  <div className="profile-edit-height-row">
                    <input type="number" inputMode="numeric" placeholder="ft" value={heightFt}
                      onChange={e => setHeightFt(e.target.value === '' ? '' : Number(e.target.value))} />
                    <input type="number" inputMode="numeric" placeholder="in" value={heightIn}
                      onChange={e => setHeightIn(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                </>
              )}
            </div>
            <div className="profile-edit-field">
              <label>Tracking since</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="profile-edit-field">
              <label>Date of birth</label>
              <input type="date" value={dob} max={localDateStr()} onChange={e => setDob(e.target.value)} />
            </div>
            <div className="profile-edit-field">
              <label>Starting weight ({isMetric ? 'kg' : 'lbs'})</label>
              <input type="number" inputMode="decimal" step="0.1" value={startWeightLbs} onChange={e => setStartWeightLbs(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div className="profile-edit-field">
              <label>Starting body fat %</label>
              <input type="number" inputMode="decimal" step="0.1" min="3" max="60" value={startBF} onChange={e => setStartBF(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div className="profile-edit-field">
              <label>Goal weight ({isMetric ? 'kg' : 'lbs'})</label>
              <input type="number" inputMode="decimal" step="0.1" value={goalWeightLbs} onChange={e => setGoalWeightLbs(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div className="profile-edit-field">
              <label>Goal body fat %</label>
              <input type="number" inputMode="decimal" step="0.1" min="3" max="60" value={goalBF} onChange={e => setGoalBF(e.target.value === '' ? '' : Number(e.target.value))} />
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
    </div>,
    document.body
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate()
  const { mode, signOut } = useAuth()
  const { today } = useDashboardData()
  const units = useUnits()
  const isMetric = units.system === 'metric'
  const wUnit = isMetric ? 'kg' : 'lbs'
  const toW = (kg: number) => isMetric ? +kg.toFixed(1) : kgToLbs(kg)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [editing,     setEditing]     = useState(false)
  const [dbStats,     setDbStats]     = useState<{ workoutCount: number; logCount: number; nutritionCount: number } | null>(null)
  const [ownedDevices, setOwnedDevicesState] = useState<DeviceId[] | null>(null)
  const [weeklyWraps, setWeeklyWraps] = useState<WeeklyReview[]>([])
  const [openWrap,    setOpenWrap]    = useState<WeeklyReview | null>(null)

  useEffect(() => {
    getProfile().then(setProfileData)
    getDBStats().then(s => setDbStats({ workoutCount: s.workoutCount, logCount: s.logCount, nutritionCount: s.nutritionCount }))
    getOwnedDevices().then(setOwnedDevicesState)
    getAllWeeklyReviews().then(setWeeklyWraps)
  }, [])

  const ownedDeviceRows = DEVICES.filter(d => owns(ownedDevices, d.id))

  async function handleSave(data: Omit<ProfileData, 'id' | 'updatedAt'>) {
    await saveProfile(data)
    const updated = await getProfile()
    setProfileData(updated)
  }

  const name     = profileData?.name || 'Guest'
  const bio      = profileData?.bio ?? ''
  const heightCm = profileData?.heightCm
  const photo    = profileData?.photoDataUrl
  const avatarId = profileData?.avatarId
  const days     = daysSince(profileData?.startDate)

  const startWeightLbs = profileData?.startWeightKg ? toW(profileData.startWeightKg) : null
  const startBF        = profileData?.startBodyFatPct ?? null
  const goalWeightLbs  = profileData?.goalWeightKg ? toW(profileData.goalWeightKg) : null
  const goalBF         = profileData?.goalBodyFatPct ?? null
  const goalNotes      = profileData?.goalNotes

  const currentWeightLbs = today.weight ? toW(today.weight) : undefined
  const currentBF        = today.bodyFatPct

  const weightLost = (currentWeightLbs != null && startWeightLbs != null) ? +(startWeightLbs - currentWeightLbs).toFixed(1) : null
  const bfLost     = (currentBF != null && startBF != null) ? +(startBF - currentBF).toFixed(1) : null

  const milestones = [
    ...(days != null ? [{
      icon: Calendar,
      color: 'var(--blue)',
      label: `${days} days tracked`,
      sub: `Since ${new Date(profileData!.startDate! + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    }] : []),
    ...(weightLost != null && weightLost > 0 ? [{
      icon: TrendingDown,
      color: 'var(--green)',
      label: `-${weightLost} ${wUnit} lost`,
      sub: `${startWeightLbs} → ${currentWeightLbs} ${wUnit}`,
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
      sub: 'Logged in Jeevan',
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

      {/* ── Mobile header bar: Settings + auth (hidden on desktop where sidebar has it) ── */}
      <div className="profile-mobile-header">
        <button className="profile-settings-btn" onClick={() => navigate('/settings')} aria-label="Settings">
          <Settings size={20} />
          <span>Settings</span>
        </button>
        {mode === 'guest' ? (
          <button className="profile-settings-btn profile-auth-btn" onClick={() => navigate('/auth')} aria-label="Sign in">
            <LogIn size={20} />
            <span>Sign in</span>
          </button>
        ) : mode === 'authenticated' ? (
          <button className="profile-settings-btn profile-auth-btn profile-auth-btn--out" onClick={() => signOut()} aria-label="Sign out">
            <LogOut size={20} />
            <span>Sign out</span>
          </button>
        ) : null}
      </div>

      {/* ── Hero ── */}
      <section className="profile-hero">
        <div className="profile-hero-bg" />
        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            <AvatarDisplay name={name} avatarId={avatarId} photoDataUrl={photo} size="lg" />
            <button className="profile-avatar-edit-btn" onClick={() => setEditing(true)}>
              <Camera size={14} />
            </button>
          </div>
          <h1 className="profile-name">{name}</h1>
          {bio && <p className="profile-bio">{bio}</p>}
          <div className="profile-meta-row">
            {heightCm && <span className="profile-meta-chip">{cmToFeet(heightCm)}</span>}
            {currentWeightLbs && <span className="profile-meta-chip">{currentWeightLbs} {wUnit}</span>}
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
          <div className="profile-card-title-row">
            <h2 className="profile-card-title">Progress Toward Goals</h2>
          </div>
          {currentWeightLbs != null && startWeightLbs != null && goalWeightLbs != null && (
            <ProgressBar
              label="Weight"
              from={startWeightLbs}
              to={goalWeightLbs}
              current={currentWeightLbs}
              unit={` ${wUnit}`}
              lowerIsBetter={startWeightLbs > goalWeightLbs}
              colorGood="var(--blue)"
            />
          )}
          {currentBF != null && startBF != null && goalBF != null && (
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
          {goalNotes && (
            <p className="profile-goal-notes">
              🎯 {goalNotes.split(',').map(g => g.trim()).filter(Boolean).map(goalLabel).join(', ')}
            </p>
          )}
        </section>

        {/* ── Baseline ── */}
        {(startWeightLbs != null || startBF != null || goalWeightLbs != null || goalBF != null) && (
        <section className="profile-card">
          <h2 className="profile-card-title">Starting Baseline</h2>
          <div className="profile-baseline-grid">
            {startWeightLbs != null && (
              <div className="profile-baseline-item">
                <span className="profile-baseline-val">{startWeightLbs} {wUnit}</span>
                <span className="profile-baseline-label">Start weight</span>
              </div>
            )}
            {startBF != null && (
              <div className="profile-baseline-item">
                <span className="profile-baseline-val">{startBF}%</span>
                <span className="profile-baseline-label">Start body fat</span>
              </div>
            )}
            {goalWeightLbs != null && (
              <div className="profile-baseline-item">
                <span className="profile-baseline-val" style={{ color: 'var(--blue)' }}>{goalWeightLbs} {wUnit}</span>
                <span className="profile-baseline-label">Goal weight</span>
              </div>
            )}
            {goalBF != null && (
              <div className="profile-baseline-item">
                <span className="profile-baseline-val" style={{ color: 'var(--blue)' }}>{goalBF}%</span>
                <span className="profile-baseline-label">Goal body fat</span>
              </div>
            )}
          </div>
        </section>
        )}

        {/* ── Primary Goals ── */}
        {(goalNotes || profileData?.activityLevel) && (
          <section className="profile-card">
            <h2 className="profile-card-title">Goals &amp; Activity</h2>
            {goalNotes && (
              <ul className="profile-goals-list">
                {goalNotes.split(',').map(g => g.trim()).filter(Boolean).map(g => (
                  <li key={g} className="profile-goal-item">
                    <CheckCircle2 size={15} className="profile-goal-icon" />
                    <span>{goalLabel(g)}</span>
                  </li>
                ))}
              </ul>
            )}
            {profileData?.activityLevel && (
              <p className="profile-no-data" style={{ marginTop: goalNotes ? 10 : 0 }}>
                Activity level: <strong style={{ color: 'var(--text-primary)' }}>
                  {profileData.activityLevel.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </strong>
              </p>
            )}
          </section>
        )}

        {/* ── Setup ── */}
        <section className="profile-card">
          <button
            className="profile-setup-again-btn"
            onClick={() => navigate('/onboarding?edit=1')}
          >
            <Settings size={16} />
            Run Setup Again
          </button>
        </section>

        {/* ── Weekly Wraps ── */}
        {weeklyWraps.length > 0 && (
          <section className="profile-card">
            <div className="profile-card-title-row">
              <h2 className="profile-card-title">Weekly Wraps</h2>
            </div>
            <div className="profile-devices-list">
              {weeklyWraps.map(w => (
                <button key={w.id} className="profile-device-row profile-wrap-row" onClick={() => setOpenWrap(w)}>
                  <div className="profile-device-icon-wrap">
                    <Sparkles size={18} />
                  </div>
                  <div className="profile-device-info">
                    <span className="profile-device-name">
                      {new Date(w.weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' – '}
                      {new Date(w.weekEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="profile-device-sub">{w.biggestWin ?? w.summary}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Connected Devices ── */}
        <section className="profile-card">
          <div className="profile-card-title-row">
            <h2 className="profile-card-title">Connected Devices</h2>
            <button className="profile-devices-manage-btn" onClick={() => navigate('/connected-accounts')}>
              Manage
            </button>
          </div>
          {ownedDeviceRows.length > 0 ? (
            <div className="profile-devices-list">
              {ownedDeviceRows.map(d => (
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
          ) : (
            <p className="profile-devices-empty">
              No equipment added yet. Tap Manage to tell us what you have.
            </p>
          )}
        </section>

      </div>

      {openWrap && <WeeklyWrapCard review={openWrap} onDone={() => setOpenWrap(null)} />}
    </div>
  )
}
