import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Mic, Square } from 'lucide-react'
import './VoiceListeningOverlay.css'

/** Full-screen "listening" takeover while `useVoiceDictation` is recording/
    transcribing — a live, amplitude-reactive orb (ChatGPT-voice-style)
    instead of a silent mic icon, so it's visibly doing something. Samples
    the live `MediaStream` directly via Web Audio (writing a CSS custom
    property on a ref each animation frame, not React state, so this stays
    smooth at 60fps without re-rendering). */
export default function VoiceListeningOverlay({ stream, phase, onStop }: {
  stream: MediaStream | null
  phase: 'recording' | 'transcribing'
  onStop: () => void
}) {
  const orbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!stream) return
    const AudioCtxCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtxCtor) return

    const audioCtx = new AudioCtxCtor()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0

    function tick() {
      analyser.getByteTimeDomainData(data)
      let sumSquares = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sumSquares += v * v
      }
      const rms = Math.sqrt(sumSquares / data.length)
      const level = Math.min(1, rms * 4) // raw mic RMS is small — amplify for a visible range
      orbRef.current?.style.setProperty('--level', level.toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      source.disconnect()
      void audioCtx.close().catch(() => {})
    }
  }, [stream])

  return createPortal(
    // React bubbles synthetic events along the component tree, not the
    // physical DOM tree — so even though this portals to document.body, a
    // click here would otherwise still reach an ancestor's onClick (e.g. a
    // modal backdrop's onClick={onClose}) and close the thing this overlay
    // is sitting on top of. Stop it right at this boundary.
    <div className="voice-overlay" onClick={e => e.stopPropagation()}>
      <div className="voice-orb-wrap">
        <div className="voice-orb-ring voice-orb-ring--1" />
        <div className="voice-orb-ring voice-orb-ring--2" />
        <div className="voice-orb" ref={orbRef}>
          <Mic size={26} />
        </div>
      </div>
      <p className="voice-overlay-label">{phase === 'recording' ? 'Listening…' : 'Transcribing…'}</p>
      {phase === 'recording' && (
        <button className="voice-stop-btn" onClick={onStop} aria-label="Stop and use this">
          <Square size={14} /> Done
        </button>
      )}
    </div>,
    document.body
  )
}
