import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Video, Upload, X, Check } from 'lucide-react'
import LiveCamera from '../components/LiveCamera'
import PhotoLightbox from '../components/PhotoLightbox'
import { compressImageUnderBytes } from '../lib/imageUtils'
import { savePhoto, getPhotos, getPoseLabels } from '../db/progressPhotoStore'
import type { ProgressPhoto, ProgressPhotoPose } from '../db'
import { getLatestSnapshots } from '../db/healthStore'
import { localDateStr, kgToLbs } from '../data/config'
import './ProgressCheckIns.css'

interface LightboxState {
  photoDataUrl: string
  caption: string
  meta?: string
}

/** Finds the logged weight closest in time to `targetDate` (within a year
    either side), for showing alongside a check-in photo as context — reuses
    the same snapshot source Coach's get_health_context already relies on,
    not a new data path. */
async function findClosestWeightLbs(targetDate: string): Promise<{ weightLbs: number; date: string } | null> {
  const snapshots = await getLatestSnapshots(365)
  const withWeight = snapshots.filter(s => s.weight != null)
  if (withWeight.length === 0) return null
  const targetMs = new Date(targetDate).getTime()
  let closest = withWeight[0]
  let closestDiffMs = Math.abs(new Date(closest.date).getTime() - targetMs)
  for (const s of withWeight) {
    const diffMs = Math.abs(new Date(s.date).getTime() - targetMs)
    if (diffMs < closestDiffMs) { closest = s; closestDiffMs = diffMs }
  }
  return { weightLbs: Math.round(kgToLbs(closest.weight!) * 10) / 10, date: closest.date }
}

function poseLabel(photo: Pick<ProgressPhoto, 'pose' | 'customLabel'>): string {
  if (photo.pose === 'custom') return photo.customLabel || 'Custom'
  return photo.pose.charAt(0).toUpperCase() + photo.pose.slice(1)
}

async function buildLightboxState(photo: ProgressPhoto): Promise<LightboxState> {
  const weight = await findClosestWeightLbs(photo.date)
  const sameDayWeight = weight && weight.date === photo.date
  return {
    photoDataUrl: photo.photoDataUrl,
    caption: `${poseLabel(photo)} — ${photo.date}`,
    meta: weight
      ? sameDayWeight
        ? `${weight.weightLbs} lbs that day`
        : `${weight.weightLbs} lbs (closest reading, ${weight.date})`
      : undefined,
  }
}

const PRESET_POSES: { pose: ProgressPhotoPose; label: string }[] = [
  { pose: 'front', label: 'Front' },
  { pose: 'back', label: 'Back' },
  { pose: 'side', label: 'Side' },
  { pose: 'flexed', label: 'Flexed' },
]

// Tried in priority order. MP4/H.264 first — Safari/WebKit (this app's
// actual native iOS wrapper) cannot play WebM back AT ALL, so recording
// with no explicit mimeType (which picks webm on Chrome, where this
// happened to "work" in earlier testing) produced a clip the review
// <video> could never decode: a permanently black frame, a `duration` that
// never left 0, and scrub/±0.1s controls that had nothing to act on since
// there was nothing to seek into. This is the actual root cause, not a
// video-element bug.
const VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=h264',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  return VIDEO_MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t))
}

const MIN_RECORDING_MS = 400

/** Record a short clip, then scrub through it frame-by-frame and capture as
    many stills as you want — each one handed to `onFrame` immediately, so
    the caller can tag/save it right away. The raw clip itself is never
    persisted; only the frames the user explicitly captures are. */
function VideoFrameCapture({ onFrame, onClose }: { onFrame: (blob: Blob) => void; onClose: () => void }) {
  const liveVideoRef = useRef<HTMLVideoElement>(null)
  const reviewVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordedMimeRef = useRef<string>('video/webm')
  const recordingStartedAtRef = useRef(0)
  const [phase, setPhase] = useState<'recording' | 'reviewing'>('recording')
  const [recording, setRecording] = useState(false)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [failed, setFailed] = useState(false)
  const [tooShort, setTooShort] = useState(false)
  const [reviewFailed, setReviewFailed] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  // getUserMedia resolves asynchronously — without this, "Start Recording"
  // renders immediately but a tap before the stream actually arrives would
  // silently no-op (startRecording's `if (!stream) return` guard), with
  // zero feedback to the user. LiveCamera.tsx already guards its shutter
  // button the same way.
  const [cameraReady, setCameraReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFailed(true)
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (liveVideoRef.current) liveVideoRef.current.srcObject = stream
        setCameraReady(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (clipUrl) URL.revokeObjectURL(clipUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    setTooShort(false)
    const mimeType = pickSupportedMimeType()
    recordedMimeRef.current = mimeType || 'video/webm'
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      // A near-instant tap-record-tap-stop can produce a clip with no
      // actual decodable frames — catch it here rather than showing a
      // silently-black review screen the user can't explain.
      if (Date.now() - recordingStartedAtRef.current < MIN_RECORDING_MS) {
        setTooShort(true)
        return
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || recordedMimeRef.current })
      setClipUrl(URL.createObjectURL(blob))
      setPhase('reviewing')
    }
    recordingStartedAtRef.current = Date.now()
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
  }

  function stopRecording() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  function retryAfterTooShort() {
    setTooShort(false)
    setFailed(false)
    setCameraReady(false)
    // Camera track was stopped on the aborted recorder's onstop — re-acquire.
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        streamRef.current = stream
        if (liveVideoRef.current) liveVideoRef.current.srcObject = stream
        setCameraReady(true)
      })
      .catch(() => setFailed(true))
  }

  function retryAfterReviewFailed() {
    setReviewFailed(false)
    setPhase('recording')
    setCameraReady(false)
    if (clipUrl) { URL.revokeObjectURL(clipUrl); setClipUrl(null) }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        streamRef.current = stream
        if (liveVideoRef.current) liveVideoRef.current.srcObject = stream
        setCameraReady(true)
      })
      .catch(() => setFailed(true))
  }

  /** Chromium has a long-standing bug where a MediaRecorder-produced blob
      reports `duration: Infinity` (and won't paint a real frame) until you
      seek past the apparent end once — this forces the browser to actually
      index the file. Without it the review video stays genuinely black
      (confirmed, not just a styling issue) and the scrub range's `max`
      becomes Infinity, so dragging it does nothing. Standard documented
      workaround: seek absurdly far forward, wait for the duration to
      resolve via `timeupdate`, then seek back near the start. */
  function fixDurationThenSeekToStart(video: HTMLVideoElement) {
    const finish = () => {
      setDuration(video.duration)
      video.currentTime = 0.05
      // A handful of devices/codec combinations report success
      // (isTypeSupported said yes, the recording "worked") but produce a
      // blob that decodes with degenerate dimensions — never trust that
      // silently; surface it as a recoverable error instead of a
      // confusing black screen nobody can explain.
      if (video.videoWidth <= 2 || video.videoHeight <= 2) setReviewFailed(true)
    }
    if (video.duration === Infinity || Number.isNaN(video.duration)) {
      video.currentTime = Number.MAX_SAFE_INTEGER
      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        video.removeEventListener('timeupdate', onTimeUpdate)
        finish()
      }
      // A genuinely degenerate blob can just never fire `timeupdate` at all
      // after the seek — nothing to resolve into. Without this fallback
      // that hangs forever: no scrub controls (duration stays broken) and
      // no error shown either, the exact silent-black-screen failure mode
      // this whole function exists to avoid.
      const onTimeUpdate = () => settle()
      video.addEventListener('timeupdate', onTimeUpdate)
      setTimeout(settle, 2000)
    } else {
      finish()
    }
  }

  function captureFrame() {
    const video = reviewVideoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => { if (blob) { onFrame(blob); setSavedCount(c => c + 1) } }, 'image/jpeg', 0.9)
  }

  function seek(delta: number) {
    const video = reviewVideoRef.current
    if (!video) return
    video.currentTime = Math.min(duration, Math.max(0, video.currentTime + delta))
  }

  if (failed) {
    return createPortal(
      <div className="vfc-overlay vfc-overlay--fallback">
        <p>Couldn't access the camera for video — you can still take single photos instead.</p>
        <button className="vfc-done-btn" onClick={onClose}>Close</button>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div className="vfc-overlay">
      <button className="vfc-close" onClick={onClose} aria-label="Close"><X size={20} /></button>

      {phase === 'recording' ? (
        <>
          <video ref={liveVideoRef} autoPlay playsInline muted className="vfc-video" />
          {recording && <div className="vfc-recording-badge"><span className="vfc-recording-dot" /> Recording…</div>}
          {tooShort && (
            <div className="vfc-too-short">
              <p>That was too quick to capture — hold Start Recording a little longer.</p>
              <button className="vfc-done-btn" onClick={retryAfterTooShort}>Try Again</button>
            </div>
          )}
          <div className="vfc-controls">
            {!recording ? (
              <button className="vfc-record-btn" onClick={startRecording} disabled={!cameraReady}>
                {cameraReady ? 'Start Recording' : 'Starting camera…'}
              </button>
            ) : (
              <button className="vfc-stop-btn" onClick={stopRecording}>Stop</button>
            )}
          </div>
        </>
      ) : reviewFailed ? (
        <div className="vfc-too-short">
          <p>That recording didn't come through right — try recording again.</p>
          <button className="vfc-done-btn" onClick={retryAfterReviewFailed}>Try Again</button>
        </div>
      ) : (
        <>
          <video
            ref={reviewVideoRef}
            src={clipUrl ?? undefined}
            playsInline
            muted
            className="vfc-video"
            onLoadedMetadata={e => fixDurationThenSeekToStart(e.currentTarget)}
            onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
          />
          <div className="vfc-scrub-controls">
            {savedCount > 0 && <div className="vfc-saved-count">{savedCount} frame{savedCount === 1 ? '' : 's'} saved</div>}
            <input
              className="vfc-scrub-range"
              type="range" min={0} max={duration || 0} step={0.03} value={currentTime}
              onChange={e => {
                const t = Number(e.target.value)
                if (reviewVideoRef.current) reviewVideoRef.current.currentTime = t
                setCurrentTime(t)
              }}
            />
            <div className="vfc-scrub-row">
              <button onClick={() => seek(-0.1)}>-0.1s</button>
              <button className="vfc-capture-btn" onClick={captureFrame}>
                <Camera size={16} /> Save This Frame
              </button>
              <button onClick={() => seek(0.1)}>+0.1s</button>
            </div>
            <button className="vfc-done-btn" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </div>,
    document.body
  )
}

function PoseChips({ selected, onSelect, extraLabels }: {
  selected: ProgressPhotoPose | 'all' | null
  onSelect: (pose: ProgressPhotoPose, customLabel?: string) => void
  extraLabels: string[]
}) {
  return (
    <div className="pci-pose-chips">
      {PRESET_POSES.map(p => (
        <button
          key={p.pose}
          className={`pci-chip ${selected === p.pose ? 'pci-chip--active' : ''}`}
          onClick={() => onSelect(p.pose)}
        >
          {p.label}
        </button>
      ))}
      {extraLabels.map(label => (
        <button
          key={label}
          className={`pci-chip ${selected === 'custom' ? 'pci-chip--active' : ''}`}
          onClick={() => onSelect('custom', label)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

interface StagedPhoto {
  localId: string
  dataUrl: string
  pose: ProgressPhotoPose | null
  customLabel: string
  customInputOpen: boolean
  saving: boolean
}

function genLocalId() { return `staged_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

/** The Capture/Compare photo check-in UI — mounted as the default view of
    the Progress tab (see WorkoutProgressPage.tsx) rather than its own
    route, per explicit request to make check-ins "the first thing they see
    when they click progress." No page chrome of its own (sub-nav, header)
    — the parent page owns that. */
export default function CheckInsSection() {
  const [mode, setMode] = useState<'capture' | 'compare'>('capture')

  // ── Capture state ── a list, not a single slot: scrubbing a recording can
  // produce several captured frames before the user tags/saves any of them,
  // so each one needs its own card rather than overwriting the last.
  const [staged, setStaged] = useState<StagedPhoto[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const [sessionSavedCount, setSessionSavedCount] = useState(0)
  const [knownCustomLabels, setKnownCustomLabels] = useState<string[]>([])

  // ── Compare state ──
  const [filterPose, setFilterPose] = useState<ProgressPhotoPose | 'all'>('all')
  const [filterCustomLabel, setFilterCustomLabel] = useState<string | undefined>(undefined)
  const [dateA, setDateA] = useState('')
  const [dateB, setDateB] = useState('')
  const [comparePhotos, setComparePhotos] = useState<ProgressPhoto[]>([])
  const [compareCustomLabels, setCompareCustomLabels] = useState<string[]>([])
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [progression, setProgression] = useState<{ daysBetween: number; weightDeltaLbs: number | null } | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const loadCustomLabels = useCallback(async () => {
    const labels = await getPoseLabels()
    const custom = labels.filter(l => l.pose === 'custom').map(l => l.label)
    setKnownCustomLabels(custom)
    setCompareCustomLabels(custom)
  }, [])

  useEffect(() => { void loadCustomLabels() }, [loadCustomLabels])

  const refreshComparePhotos = useCallback(async () => {
    const filter = filterPose === 'all'
      ? undefined
      : { pose: filterPose, customLabel: filterPose === 'custom' ? filterCustomLabel : undefined }
    const all = await getPhotos(filter)
    setComparePhotos(all)
  }, [filterPose, filterCustomLabel])

  useEffect(() => {
    if (mode === 'compare') void refreshComparePhotos()
  }, [mode, refreshComparePhotos])

  // Days-between + weight delta between the two selected dates, when both
  // are set — factual framing only ("+2.3 lbs" / "no change"), nothing
  // invented about what the photos themselves show.
  useEffect(() => {
    if (!dateA || !dateB) { setProgression(null); return }
    let cancelled = false
    Promise.all([findClosestWeightLbs(dateA), findClosestWeightLbs(dateB)]).then(([wA, wB]) => {
      if (cancelled) return
      const daysBetween = Math.round(Math.abs(new Date(dateB).getTime() - new Date(dateA).getTime()) / 86_400_000)
      const weightDeltaLbs = wA && wB ? Math.round((wB.weightLbs - wA.weightLbs) * 10) / 10 : null
      setProgression({ daysBetween, weightDeltaLbs })
    })
    return () => { cancelled = true }
  }, [dateA, dateB])

  function openLightbox(photo: ProgressPhoto) {
    void buildLightboxState(photo).then(setLightbox)
  }

  async function handleStagedBlob(blob: Blob) {
    const dataUrl = await compressImageUnderBytes(blob, 1_500_000, 1600)
    setStaged(cur => [...cur, { localId: genLocalId(), dataUrl, pose: null, customLabel: '', customInputOpen: false, saving: false }])
  }

  function updateStaged(localId: string, patch: Partial<StagedPhoto>) {
    setStaged(cur => cur.map(s => (s.localId === localId ? { ...s, ...patch } : s)))
  }

  function discardStaged(localId: string) {
    setStaged(cur => cur.filter(s => s.localId !== localId))
  }

  async function saveStaged(localId: string) {
    const item = staged.find(s => s.localId === localId)
    if (!item || !item.pose || item.saving) return
    if (item.pose === 'custom' && !item.customLabel.trim()) return
    updateStaged(localId, { saving: true })
    try {
      await savePhoto({
        date: localDateStr(),
        pose: item.pose,
        customLabel: item.pose === 'custom' ? item.customLabel.trim() : undefined,
        photoDataUrl: item.dataUrl,
      })
      setStaged(cur => cur.filter(s => s.localId !== localId))
      setSessionSavedCount(c => c + 1)
      await loadCustomLabels()
    } catch {
      updateStaged(localId, { saving: false })
    }
  }

  const photosA = dateA ? comparePhotos.filter(p => p.date === dateA) : []
  const photosB = dateB ? comparePhotos.filter(p => p.date === dateB) : []
  const showingCompare = !!dateA || !!dateB

  return (
    <div className="progress-checkins-section">
      <div className="pci-mode-toggle">
        <button className={mode === 'capture' ? 'pci-mode-active' : ''} onClick={() => setMode('capture')}>Capture</button>
        <button className={mode === 'compare' ? 'pci-mode-active' : ''} onClick={() => setMode('compare')}>Compare</button>
      </div>

      {mode === 'capture' && (
        <div className="pci-capture">
          <div className="pci-capture-actions">
            <button className="pci-capture-btn" onClick={() => setShowCamera(true)}>
              <Camera size={22} />
              <span>Take Photo</span>
            </button>
            <button className="pci-capture-btn" onClick={() => setShowRecorder(true)}>
              <Video size={22} />
              <span>Record &amp; Pick Frames</span>
            </button>
            <button className="pci-capture-btn" onClick={() => uploadInputRef.current?.click()}>
              <Upload size={22} />
              <span>Upload</span>
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleStagedBlob(f) }}
            />
          </div>

          {sessionSavedCount > 0 && staged.length === 0 && (
            <div className="pci-saved-note"><Check size={14} /> {sessionSavedCount} saved to your check-ins this session.</div>
          )}

          {staged.map(item => (
            <div key={item.localId} className="pci-stage">
              <img
                src={item.dataUrl}
                alt=""
                className="pci-stage-img"
                onClick={() => setLightbox({ photoDataUrl: item.dataUrl, caption: 'Not saved yet' })}
              />

              <div className="pci-stage-pose">
                <PoseChips
                  selected={item.pose}
                  extraLabels={knownCustomLabels}
                  onSelect={(pose, label) => {
                    if (pose === 'custom') {
                      updateStaged(item.localId, { pose: 'custom', customLabel: label ?? '', customInputOpen: !label })
                    } else {
                      updateStaged(item.localId, { pose, customInputOpen: false })
                    }
                  }}
                />
                <button
                  className={`pci-chip ${item.pose === 'custom' && item.customInputOpen ? 'pci-chip--active' : ''}`}
                  onClick={() => updateStaged(item.localId, { pose: 'custom', customInputOpen: true, customLabel: '' })}
                >
                  Custom…
                </button>
              </div>

              {item.pose === 'custom' && item.customInputOpen && (
                <input
                  className="pci-custom-input"
                  placeholder="e.g. vacuum pose"
                  value={item.customLabel}
                  onChange={e => updateStaged(item.localId, { customLabel: e.target.value })}
                  autoFocus
                />
              )}

              <div className="pci-stage-actions">
                <button className="pci-discard-btn" onClick={() => discardStaged(item.localId)}>Discard</button>
                <button
                  className="pci-save-btn"
                  onClick={() => void saveStaged(item.localId)}
                  disabled={!item.pose || item.saving || (item.pose === 'custom' && !item.customLabel.trim())}
                >
                  {item.saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'compare' && (
        <div className="pci-compare">
          <PoseChips
            selected={filterPose}
            extraLabels={compareCustomLabels}
            onSelect={(pose, label) => {
              setFilterPose(pose)
              setFilterCustomLabel(pose === 'custom' ? label : undefined)
            }}
          />
          <button
            className={`pci-chip pci-chip--all ${filterPose === 'all' ? 'pci-chip--active' : ''}`}
            onClick={() => { setFilterPose('all'); setFilterCustomLabel(undefined) }}
          >
            All
          </button>

          <div className="pci-date-row">
            <input type="date" value={dateA} onChange={e => setDateA(e.target.value)} />
            <span>vs</span>
            <input type="date" value={dateB} onChange={e => setDateB(e.target.value)} />
            {(dateA || dateB) && (
              <button className="pci-clear-dates" onClick={() => { setDateA(''); setDateB('') }}>Clear</button>
            )}
          </div>

          {showingCompare ? (
            <>
              {progression && (
                <div className="pci-progression">
                  {progression.daysBetween} day{progression.daysBetween === 1 ? '' : 's'} apart
                  {progression.weightDeltaLbs != null && (
                    progression.weightDeltaLbs === 0
                      ? ' — no change in weight'
                      : ` — ${progression.weightDeltaLbs > 0 ? '+' : ''}${progression.weightDeltaLbs} lbs`
                  )}
                </div>
              )}
              <div className="pci-compare-grid">
                <div className="pci-compare-col">
                  <div className="pci-compare-col-label">{dateA || 'Pick a date'}</div>
                  {photosA.length > 0 ? photosA.map(p => (
                    <img key={p.id} src={p.photoDataUrl} alt="" className="pci-compare-img" onClick={() => openLightbox(p)} />
                  )) : <div className="pci-compare-empty">No photo for this date/pose.</div>}
                </div>
                <div className="pci-compare-col">
                  <div className="pci-compare-col-label">{dateB || 'Pick a date'}</div>
                  {photosB.length > 0 ? photosB.map(p => (
                    <img key={p.id} src={p.photoDataUrl} alt="" className="pci-compare-img" onClick={() => openLightbox(p)} />
                  )) : <div className="pci-compare-empty">No photo for this date/pose.</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="pci-grid">
              {comparePhotos.length === 0 ? (
                <div className="pci-empty">No check-ins yet{filterPose !== 'all' ? ' for this pose' : ''}.</div>
              ) : comparePhotos.map(p => (
                <div key={p.id} className="pci-grid-item" onClick={() => openLightbox(p)}>
                  <img src={p.photoDataUrl} alt="" />
                  <span>{p.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCamera && (
        <LiveCamera
          onCapture={async blob => { setShowCamera(false); await handleStagedBlob(blob) }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {showRecorder && (
        <VideoFrameCapture
          onFrame={blob => void handleStagedBlob(blob)}
          onClose={() => setShowRecorder(false)}
        />
      )}
      {lightbox && (
        <PhotoLightbox
          photoDataUrl={lightbox.photoDataUrl}
          caption={lightbox.caption}
          meta={lightbox.meta}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
