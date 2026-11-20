import { useRef, useState, useCallback } from 'react'
import { transcribeAudio } from '../lib/voiceApi'

// Tried in priority order — mp4/aac is what Safari/WebKit (this app's real
// native iOS environment) actually records; webm/opus covers Chrome/
// Android. No explicit mimeType picks whatever the browser defaults to,
// which is the same class of bug that broke the Check-Ins video recorder.
const AUDIO_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']

function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  return AUDIO_MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t))
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Dictate-to-text via real audio capture + server-side (Groq Whisper)
    transcription — replaces the browser's own SpeechRecognition API, which
    Safari/WebKit (this app's actual native iOS wrapper) doesn't reliably
    implement: the mic button would render (since a `webkitSpeechRecognition`
    constructor can exist) but `start()` would silently no-op or error,
    which is exactly the "nothing happens when I tap the mic" bug reports
    traced back to it. `getUserMedia`/`MediaRecorder` are solid everywhere,
    so this works where the old hook didn't.

    Same external shape as the old `useSpeechToText` (`onResult` called once
    with the final transcript) plus `phase`/`stream`, which a
    `VoiceListeningOverlay` uses to render live amplitude while recording. */
export function useVoiceDictation(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [phase, setPhase] = useState<'recording' | 'transcribing'>('recording')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef('audio/webm')

  const supported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'

  const startRecording = useCallback(async () => {
    if (!supported) return
    let mediaStream: MediaStream
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Permission denied/unavailable — stay not-listening, no error UI;
      // the mic button just doesn't do anything this time, same as before,
      // but at least never a confusing hard failure.
      return
    }

    const mimeType = pickSupportedAudioMimeType()
    mimeRef.current = mimeType || 'audio/webm'
    chunksRef.current = []
    // isTypeSupported() has already been caught lying once in this app (the
    // Check-Ins video recorder) — the constructor itself can still throw
    // (NotSupportedError) even when isTypeSupported claimed otherwise, so
    // this can never be allowed to be an uncaught exception that takes the
    // whole app down. Fall back to the no-mimeType constructor, and if even
    // that throws, release the mic and bail out quietly like a denied
    // permission rather than crashing.
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream)
    } catch {
      try {
        recorder = new MediaRecorder(mediaStream)
      } catch {
        mediaStream.getTracks().forEach(t => t.stop())
        return
      }
    }
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      mediaStream.getTracks().forEach(t => t.stop())
      setStream(null)
      setPhase('transcribing')
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeRef.current })
      if (blob.size === 0) { setListening(false); return }
      blobToDataUrl(blob)
        .then(transcribeAudio)
        .then(text => { if (text) onResult(text) })
        .finally(() => setListening(false))
    }

    recorder.start()
    recorderRef.current = recorder
    setStream(mediaStream)
    setPhase('recording')
    setListening(true)
  }, [supported, onResult])

  const toggle = useCallback(() => {
    if (listening && phase === 'recording') {
      recorderRef.current?.stop()
    } else if (!listening) {
      void startRecording()
    }
  }, [listening, phase, startRecording])

  return { listening, phase, stream, toggle, supported }
}
