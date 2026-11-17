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
// identically on retry. Confirmed live: a tool-calling round genuinely hit
// this during testing before this was added, and surfaced as the generic
// fallback text despite nothing being wrong with the request itself.
const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [400, 1200]

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
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
    const message = data?.choices?.[0]?.message
    if (!message) throw new GroqCallError('Groq response had no message')
    return message as GroqMessage
  }

  throw lastError ?? new GroqCallError('Groq call failed')
}
