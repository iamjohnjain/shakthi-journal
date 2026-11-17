import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Video, X, Check } from 'lucide-react'
import SubNav from '../components/WorkoutsSubNav'
import LiveCamera from '../components/LiveCamera'
import { compressImageUnderBytes } from '../lib/imageUtils'
import { savePhoto, getPhotos, getPoseLabels } from '../db/progressPhotoStore'
import type { ProgressPhoto, ProgressPhotoPose } from '../db'
import { localDateStr } from '../data/config'
import './ProgressCheckIns.css'

const PRESET_POSES: { pose: ProgressPhotoPose; label: string }[] = [
  { pose: 'front', label: 'Front' },
  { pose: 'back', label: 'Back' },
  { pose: 'side', label: 'Side' },
  { pose: 'flexed', label: 'Flexed' },
]

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
  const [phase, setPhase] = useState<'recording' | 'reviewing'>('recording')
  const [recording, setRecording] = useState(false)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [failed, setFailed] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

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
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      streamRef.current?.getTracks().forEach(t => t.stop())
      setClipUrl(URL.createObjectURL(blob))
      setPhase('reviewing')
    }
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
  }

  function stopRecording() {
    recorderRef.current?.stop()
    setRecording(false)
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
          <div className="vfc-controls">
            {!recording ? (
              <button className="vfc-record-btn" onClick={startRecording}>Start Recording</button>
            ) : (
              <button className="vfc-stop-btn" onClick={stopRecording}>Stop</button>
            )}
          </div>
        </>
      ) : (
        <>
          <video
            ref={reviewVideoRef}
            src={clipUrl ?? undefined}
            playsInline
            className="vfc-video"
            onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
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

export default function ProgressCheckIns() {
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
    <div className="progress-checkins-page">
      <SubNav />

      <header className="page-header">
        <div>
          <h1 className="page-title">Check-Ins</h1>
          <p className="page-subtitle">Photo progress, tagged by pose and date</p>
        </div>
      </header>

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
          </div>

          {sessionSavedCount > 0 && staged.length === 0 && (
            <div className="pci-saved-note"><Check size={14} /> {sessionSavedCount} saved to your check-ins this session.</div>
          )}

          {staged.map(item => (
            <div key={item.localId} className="pci-stage">
              <img src={item.dataUrl} alt="" className="pci-stage-img" />

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
            <div className="pci-compare-grid">
              <div className="pci-compare-col">
                <div className="pci-compare-col-label">{dateA || 'Pick a date'}</div>
                {photosA.length > 0 ? photosA.map(p => (
                  <img key={p.id} src={p.photoDataUrl} alt="" className="pci-compare-img" />
                )) : <div className="pci-compare-empty">No photo for this date/pose.</div>}
              </div>
              <div className="pci-compare-col">
                <div className="pci-compare-col-label">{dateB || 'Pick a date'}</div>
                {photosB.length > 0 ? photosB.map(p => (
                  <img key={p.id} src={p.photoDataUrl} alt="" className="pci-compare-img" />
                )) : <div className="pci-compare-empty">No photo for this date/pose.</div>}
              </div>
            </div>
          ) : (
            <div className="pci-grid">
              {comparePhotos.length === 0 ? (
                <div className="pci-empty">No check-ins yet{filterPose !== 'all' ? ' for this pose' : ''}.</div>
              ) : comparePhotos.map(p => (
                <div key={p.id} className="pci-grid-item">
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
    </div>
  )
}
