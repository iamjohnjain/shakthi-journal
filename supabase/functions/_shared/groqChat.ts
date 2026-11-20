// Multi-turn, tool-calling-capable Groq caller for the Coach chat. Deliberately
// separate from `./groq.ts` rather than extending it: `callGroq()` is used in
// production by 5 working functions, forces `response_format: json_object`
// (wrong for a conversational/tool-calling reply, which can be plain text or
// a tool_calls array), and only ever sends a single system+user turn. This
// file is new code, not a refactor of that one.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export class GroqCallError extends Error {}

// Same retry-with-backoff as `_shared/groq.ts`'s `callGroq()` — a transient
// rate-limit or server hiccup mid-conversation shouldn't read to the user as
// "couldn't reach Jeevan" when a second attempt a moment later would have
// worked. Only retries failures with a real chance of succeeding again
// (network errors, 429, 5xx); a 400/401 fails fast since it'll fail
// identically on retry.
//
// Tuned longer than `_shared/groq.ts`'s schedule on purpose: confirmed live
// in production logs, Groq's free-tier TPM (tokens/minute) limit returned a
// 429 asking to wait 2.61s before retrying, which the old 2-retry/1.6s-total
// schedule couldn't cover — the final attempt fired too early and failed
// again. Groq's 429 body names the actual wait in its message ("Please try
// again in 2.61s"); parse and honor that when present, since it's a real
// number from the API, not a guess — fall back to the fixed schedule when
// it isn't (e.g. a 5xx, which carries no such hint).
const MAX_ATTEMPTS = 4
const RETRY_DELAYS_MS = [700, 2000, 4000]
const MAX_PARSED_DELAY_MS = 8000
// A hung request (no response, no throw) wasn't retried at all before this —
// only an outright network error or a non-ok status triggered the retry
// loop above. This forces a hang to fail fast enough to actually get a
// retry, instead of sitting until some outer platform-level timeout.
const FETCH_TIMEOUT_MS = 20_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function parseRetryDelayMs(errText: string, fallbackMs: number): number {
  const match = /try again in ([\d.]+)s/i.exec(errText)
  if (!match) return fallbackMs
  const parsedMs = Math.ceil(parseFloat(match[1]) * 1000)
  if (!Number.isFinite(parsedMs) || parsedMs <= 0) return fallbackMs
  // A little headroom on top of Groq's own number — retrying at exactly the
  // edge of the window risks landing a few ms too early.
  return Math.min(parsedMs + 300, MAX_PARSED_DELAY_MS)
}

export interface GroqToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

// A message's content is normally plain text, but a vision turn (the user
// attached a photo) needs the OpenAI-style multimodal array instead — one
// text part plus one or more image_url parts. `callGroq()`'s single-turn
// caller builds this same shape inline for its one fixed user message; here
// it has to be a per-message option since any turn in a long conversation
// could be the one carrying an image.
export type GroqContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | GroqContentPart[] | null
  tool_calls?: GroqToolCall[]
  tool_call_id?: string
  name?: string
}

export interface GroqToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>  // JSON Schema
  }
}

/** Calls Groq's OpenAI-compatible chat completions endpoint with a full
    multi-turn message history and (optionally) tool definitions, returning
    the assistant's raw reply message — which may be plain text, or a
    tool_calls request the caller has to execute and feed back in a follow-up
    call. No forced `response_format` here (unlike `callGroq()`), since a
    conversational reply must be allowed to just be plain text. Throws
    `GroqCallError` on any non-OK response or network failure; callers are
    expected to catch it and fall back to a soft reply, per this app's
    "no dead-end error screens" rule. */
export async function callGroqChat(opts: {
  apiKey: string
  model: string
  messages: GroqMessage[]
  tools?: GroqToolDef[]
  temperature?: number
  maxTokens?: number
}): Promise<GroqMessage> {
  const body = JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    ...(opts.tools && opts.tools.length > 0
      ? { tools: opts.tools, tool_choice: 'auto' }
      : {}),
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 1024,
  })

  let lastError: GroqCallError | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${opts.apiKey}`,
          },
          body,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (e) {
      lastError = new GroqCallError(`network error calling Groq: ${e}`)
      if (attempt < MAX_ATTEMPTS - 1) { await sleep(RETRY_DELAYS_MS[attempt]); continue }
      throw lastError
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      lastError = new GroqCallError(`Groq API error ${res.status}: ${errText}`)
      if (isRetryableStatus(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(parseRetryDelayMs(errText, RETRY_DELAYS_MS[attempt]))
        continue
      }
      throw lastError
    }

    const data = await res.json()
    const message = data?.choices?.[0]?.message
    if (!message) throw new GroqCallError('Groq response had no message')
    return message as GroqMessage
  }

  throw lastError ?? new GroqCallError('Groq call failed')
}
