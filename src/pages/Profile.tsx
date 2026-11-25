import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, Camera, Check, Calendar, Settings, LogIn, LogOut } from 'lucide-react'
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
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { PRIMARY_GOALS } from './OnboardingPage'
import { JSection, JRow } from './Settings'
import './Settings.css'
import './Profile.css'

const GOAL_LABEL: Record<string, string> = Object.fromEntries(PRIMARY_GOALS.map(g => [g.id, g.label]))
function goalLabel(id: string): string { return GOAL_LABEL[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

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

function ProgressBar({ label, from, to, current, unit, fmt = (n: number) => String(n) }: {
  label: string; from: number; to: number; current: number; unit: string; fmt?: (n: number) => string
}) {
  const span = to - from
  const pct = span === 0 ? 100 : clamp(Math.round((current - from) / span * 100))
  return (
    <div className="jpro-bar">
      <div className="jpro-bar-head">
        <span className="jpro-bar-label">{label}</span>
        <span className="jpro-bar-pct">{pct}% to goal</span>
      </div>
      <div className="jpro-bar-track" role="progressbar" aria-label={`${label} progress`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="jpro-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="jpro-bar-foot">
        <span>Start {fmt(from)}{unit}</span>
        <strong>Now {fmt(current)}{unit}</strong>
        <span>Goal {fmt(to)}{unit}</span>
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
              <input value={name} onChange={e => setName(e.target.value.slice(0, 50))} maxLength={50} />
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
            <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 280))} rows={3} maxLength={280} />
            <span className="profile-edit-char-count">{bio.length}/280</span>
          </div>
        </div>

        <div className="profile-modal-footer">
          <button className="profile-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="profile-modal-save" data-no-press-glow onClick={handleSave} disabled={saving}>
            <Check size={15} /> {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function titleCase(s: string) { return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function shortDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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
  const [dbStats,     setDbStats]     = useState<{ workoutCount: number; logCount: number } | null>(null)
  const [weeklyWraps, setWeeklyWraps] = useState<WeeklyReview[]>([])
  const [openWrap,    setOpenWrap]    = useState<WeeklyReview | null>(null)

  useEffect(() => {
    getProfile().then(setProfileData)
    getDBStats().then(s => setDbStats({ workoutCount: s.workoutCount, logCount: s.logCount }))
    getAllWeeklyReviews().then(setWeeklyWraps)
  }, [])

  async function handleSave(data: Omit<ProfileData, 'id' | 'updatedAt'>) {
    await saveProfile(data)
    setProfileData(await getProfile())
  }

  const name     = profileData?.name || 'Guest'
  const bio      = profileData?.bio ?? ''
  const heightCm = profileData?.heightCm
  const days     = daysSince(profileData?.startDate)
  const activity = profileData?.activityLevel ? titleCase(profileData.activityLevel) : null

  const startW  = profileData?.startWeightKg ? toW(profileData.startWeightKg) : null
  const goalW   = profileData?.goalWeightKg ? toW(profileData.goalWeightKg) : null
  const startBF = profileData?.startBodyFatPct ?? null
  const goalBF  = profileData?.goalBodyFatPct ?? null
  const goals   = (profileData?.goalNotes ?? '').split(',').map(g => g.trim()).filter(Boolean)

  const currentW  = today.weight ? toW(today.weight) : undefined
  const currentBF = today.bodyFatPct != null ? +today.bodyFatPct.toFixed(1) : undefined

  const weightChange = currentW != null && startW != null ? +(currentW - startW).toFixed(1) : null
  const losing = startW != null && goalW != null ? goalW < startW : true

  // Two headline tiles: days tracked + weight change toward the goal, with
  // workouts / daily logs filling in when either of those isn't known yet.
  const stats: Array<{ num: string; lbl: string }> = []
  if (days != null) stats.push({ num: days.toLocaleString(), lbl: days === 1 ? 'Day tracked' : 'Days tracked' })
  if (weightChange != null && weightChange !== 0) {
    stats.push({
      num: `${weightChange > 0 ? '+' : '−'}${Math.abs(weightChange)} ${wUnit}`,
      lbl: weightChange < 0 ? 'Lost since start' : (losing ? 'Up since start' : 'Gained since start'),
    })
  }
  if (stats.length < 2 && dbStats?.workoutCount) stats.push({ num: dbStats.workoutCount.toLocaleString(), lbl: dbStats.workoutCount === 1 ? 'Workout logged' : 'Workouts logged' })
  if (stats.length < 2 && dbStats?.logCount) stats.push({ num: dbStats.logCount.toLocaleString(), lbl: dbStats.logCount === 1 ? 'Daily log' : 'Daily logs' })

  const showWeightBar = currentW != null && startW != null && goalW != null
  const showBFBar     = currentBF != null && startBF != null && goalBF != null

  return (
    <div className="jpro-page">

      {editing && (
        <EditModal initial={profileData ?? {}} onClose={() => setEditing(false)} onSave={handleSave} />
      )}

      <div className="jpro-top">
        <button type="button" className="jpro-pill jpro-pill--ring" data-no-press-glow onClick={() => navigate('/settings')}>
          <Settings size={17} /> Settings
        </button>
        {mode === 'guest' ? (
          <button type="button" className="jpro-pill" onClick={() => navigate('/auth')}>
            <LogIn size={17} /> Sign In
          </button>
        ) : mode === 'authenticated' ? (
          <button type="button" className="jpro-pill" onClick={() => signOut()}>
            <LogOut size={17} /> Sign Out
          </button>
        ) : null}
      </div>

      <section className="jpro-hero">
        <div className="jpro-avatar-wrap">
          <div className="jpro-avatar">
            <AvatarDisplay name={name} avatarId={profileData?.avatarId} photoDataUrl={profileData?.photoDataUrl} size="lg" />
          </div>
          <button type="button" className="jpro-camera" data-no-press-glow aria-label="Change photo" onClick={() => setEditing(true)}>
            <Camera size={15} strokeWidth={2.2} />
          </button>
        </div>
        <h1 className="jpro-name">{name}</h1>
        {bio && <p className="jpro-bio">{bio}</p>}
        {(heightCm || currentW || activity) && (
          <div className="jpro-chips">
            {heightCm && <span className="jpro-chip">{units.height === 'cm' ? `${Math.round(heightCm)} cm` : cmToFeet(heightCm)}</span>}
            {currentW != null && <span className="jpro-chip">{currentW} {wUnit}</span>}
            {activity && <span className="jpro-chip">{activity}</span>}
          </div>
        )}
        <button type="button" className="jpro-edit" data-no-press-glow onClick={() => setEditing(true)}>Edit Profile</button>
      </section>

      {stats.length > 0 && (
        <div className="jpro-stats">
          {stats.slice(0, 2).map(s => (
            <div key={s.lbl} className="jpro-stat">
              <span className="jpro-stat-num">{s.num}</span>
              <span className="jpro-stat-lbl">{s.lbl}</span>
            </div>
          ))}
        </div>
      )}

      <section className="jset-section">
        <h2 className="jset-section-title">Progress</h2>
        <div className="jset-card jpro-progress">
          {showWeightBar && (
            <ProgressBar label="Weight" from={startW!} to={goalW!} current={currentW!} unit={` ${wUnit}`} />
          )}
          {showBFBar && (
            <ProgressBar label="Body Fat" from={startBF!} to={goalBF!} current={currentBF!} unit="%" />
          )}
          {!showWeightBar && !showBFBar && (
            <p className="jpro-empty">
              {startW == null || goalW == null
                ? 'Add a starting and goal weight in Edit Profile to track progress.'
                : 'Log your weight or import Apple Health data to see progress.'}
            </p>
          )}
        </div>
      </section>

      {(goals.length > 0 || activity) && (
        <section className="jset-section">
          <h2 className="jset-section-title">Training For</h2>
          <div className="jset-card jpro-goals">
            {goals.length > 0 && (
              <div className="jpro-goal-chips">
                {goals.map(g => <span key={g} className="jpro-goal-chip">{goalLabel(g)}</span>)}
              </div>
            )}
            {activity && (
              <div className="jpro-kv"><span>Activity level</span><span>{activity}</span></div>
            )}
          </div>
        </section>
      )}

      {weeklyWraps.length > 0 && (
        <JSection title="Weekly Wraps">
          {weeklyWraps.map(w => (
            <JRow
              key={w.id}
              icon={Calendar}
              label={`${shortDate(w.weekStart)} – ${shortDate(w.weekEnd)}`}
              desc={w.biggestWin ?? w.summary}
              onClick={() => setOpenWrap(w)}
            />
          ))}
        </JSection>
      )}


      {openWrap && <WeeklyWrapCard review={openWrap} onDone={() => setOpenWrap(null)} />}
    </div>
  )
}
