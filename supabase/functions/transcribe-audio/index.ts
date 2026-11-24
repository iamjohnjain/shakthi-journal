// Supabase Edge Function: transcribes a short voice recording to text via
// Groq's Whisper-compatible endpoint. Replaces the browser's own
// SpeechRecognition API everywhere this app dictates text — that API isn't
// reliably implemented in Safari/WebKit (this app's native iOS wrapper),
// where the mic button would render but silently do nothing. Recording
// real audio via getUserMedia/MediaRecorder and transcribing it server-side
// works everywhere instead. Same no-hard-error contract as every other AI
// function here: always 200, a soft `{ text: '', note }` on any failure.

import { corsHeaders, jsonResponse } from '../_shared/http.ts'
import { transcribeAudio, GroqAudioError } from '../_shared/groqAudio.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

// Override via `supabase secrets set GROQ_WHISPER_MODEL=...` if this
// default gets retired, same convention as every other model constant here.
const GROQ_WHISPER_MODEL = Deno.env.get('GROQ_WHISPER_MODEL') || 'whisper-large-v3-turbo'

// ~12MB base64 payload ceiling — generous for a voice note a few minutes
// long at the compressed bitrate MediaRecorder produces; a hard cap so a
// stuck/runaway recording can't send an enormous payload.
const MAX_AUDIO_BYTES = 12_000_000

function softFallback(note: string, origin: string | null): Response {
  return jsonResponse({ text: '', note }, 200, origin)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  }
  if (!checkRateLimit(req)) {
    return softFallback("Too many requests right now — wait a moment and try again.", origin)
  }

  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) {
    return softFallback("Voice input isn't set up yet.", origin)
  }

  let audioDataUrl: string
  try {
    const body = await req.json()
    audioDataUrl = typeof body?.audio === 'string' ? body.audio : ''
  } catch {
    return softFallback('Could not read that recording.', origin)
  }

  if (!audioDataUrl.startsWith('data:audio/')) {
    return softFallback("That recording didn't come through right.", origin)
  }
  if (audioDataUrl.length > MAX_AUDIO_BYTES) {
    return softFallback('That recording is a bit long — try a shorter one.', origin)
  }

  try {
    const text = await transcribeAudio({ apiKey, model: GROQ_WHISPER_MODEL, audioDataUrl })
    return jsonResponse({ text }, 200, origin)
  } catch (e) {
    if (e instanceof GroqAudioError) {
      console.error('Groq audio API error', e.message)
      return softFallback("Couldn't hear that clearly — try again.", origin)
    }
    console.error('transcribe-audio error', e)
    return softFallback('Something went wrong — try again.', origin)
  }
})
