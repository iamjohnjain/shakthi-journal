// Shared Groq chat-completions caller — every AI edge function (meal or
// workout, text or vision) goes through this so the fetch/error handling
// lives in exactly one place instead of being re-copied per function.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export class GroqCallError extends Error {}

// Retried instead of failing straight to the client's soft-fallback text —
// a transient rate-limit or server hiccup shouldn't read to the user as
// "couldn't identify that photo" when trying again a moment later would
// have worked. Only retries failures that have a real chance of succeeding
// on a second attempt (network errors, 429, 5xx) — a 400/401 would just
// fail identically again, so those still fail fast.
const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [400, 1200]

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/** Calls Groq's OpenAI-compatible chat completions endpoint and returns the
    model's raw text content. `imageDataUrls`, when given, turns the user
    message into a multimodal `[{text}, {image_url}, {image_url}, ...]`
    content array for a vision-capable model (one block per image — Groq's
    API accepts several in one message, which matters for a multi-page
    scanned document) — otherwise it's a plain string. `maxTokens` is set
    explicitly (default generous enough for a multi-day structured plan)
    since an unset default can silently truncate a long JSON response mid-
    object, which then fails to parse — a different failure mode than an
    outright rejected request, but worth guarding against here too. Retries
    transient failures (see above) before giving up. Throws `GroqCallError`
    only once retries are exhausted; callers are expected to catch it and
    fall back to a soft (never a hard error) response, per this app's
    "no dead-end error screens" rule. */
export async function callGroq(opts: {
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  imageDataUrls?: string[]
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const userContent = opts.imageDataUrls && opts.imageDataUrls.length > 0
    ? [
        { type: 'text', text: opts.userText },
        ...opts.imageDataUrls.map(url => ({ type: 'image_url', image_url: { url } })),
      ]
    : opts.userText

  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 8000,
    response_format: { type: 'json_object' },
  })

  let lastError: GroqCallError | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${opts.apiKey}`,
        },
        body,
      })
    } catch (e) {
      lastError = new GroqCallError(`network error calling Groq: ${e}`)
      if (attempt < MAX_ATTEMPTS - 1) { await sleep(RETRY_DELAYS_MS[attempt]); continue }
      throw lastError
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      lastError = new GroqCallError(`Groq API error ${res.status}: ${errText}`)
      if (isRetryableStatus(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      throw lastError
    }

    const data = await res.json()
    return data?.choices?.[0]?.message?.content ?? ''
  }

  // Unreachable in practice (the loop always returns or throws above), but
  // keeps the type checker happy without an unsafe non-null assertion.
  throw lastError ?? new GroqCallError('Groq call failed')
}
