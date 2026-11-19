// Shared Groq audio-transcription caller — same retry/error shape as
// `./groq.ts` and `./groqChat.ts`, just targeting Groq's Whisper-compatible
// `/audio/transcriptions` endpoint instead of chat completions.

const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

export class GroqAudioError extends Error {}

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [500, 1500]

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/** Decodes a `data:audio/...;base64,...` URL into a Blob, for the multipart
    form Groq's transcription endpoint expects — mirrors how the vision
    functions decode a `data:image/...` URL, just for audio. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = /data:(.*?);base64/.exec(header)?.[1] || 'audio/webm'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Transcribes audio via Groq's Whisper-compatible endpoint, returning the
    plain transcript text (trimmed). Throws GroqAudioError once retries are
    exhausted; callers are expected to catch it and fall back to empty text
    rather than a hard error, per this app's standing contract. */
export async function transcribeAudio(opts: {
  apiKey: string
  model: string
  audioDataUrl: string
}): Promise<string> {
  const blob = dataUrlToBlob(opts.audioDataUrl)

  let lastError: GroqAudioError | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const form = new FormData()
    form.append('file', blob, 'audio.webm')
    form.append('model', opts.model)
    form.append('response_format', 'json')

    let res: Response
    try {
      res = await fetch(GROQ_AUDIO_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${opts.apiKey}` },
        body: form,
      })
    } catch (e) {
      lastError = new GroqAudioError(`network error calling Groq audio: ${e}`)
      if (attempt < MAX_ATTEMPTS - 1) { await sleep(RETRY_DELAYS_MS[attempt]); continue }
      throw lastError
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      lastError = new GroqAudioError(`Groq audio API error ${res.status}: ${errText}`)
      if (isRetryableStatus(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      throw lastError
    }

    const data = await res.json()
    return typeof data?.text === 'string' ? data.text.trim() : ''
  }

  throw lastError ?? new GroqAudioError('Groq audio call failed')
}
