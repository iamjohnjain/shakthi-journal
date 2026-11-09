import { useRef, useState } from 'react'

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null ?? null
}

/** Dictate-to-text via the browser's SpeechRecognition API. `onResult` is
    called with each final transcript chunk — the caller decides how to fold
    it into whatever text field it's feeding (append, replace, etc.).
    `supported` is false when the browser has no SpeechRecognition at all,
    so callers can hide the mic button entirely rather than show one that
    silently does nothing. */
export function useSpeechToText(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechCtor = getSpeechRecognitionCtor()

  function toggle() {
    if (listening) { recognitionRef.current?.stop(); return }
    if (!speechCtor) return
    const rec = new speechCtor()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = e => {
      const t = e.results[0]?.[0]?.transcript
      if (t) onResult(t)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  return { listening, toggle, supported: !!speechCtor }
}
