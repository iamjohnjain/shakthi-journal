// Multi-turn, tool-calling-capable Groq caller for the Coach chat. Deliberately
// separate from `./groq.ts` rather than extending it: `callGroq()` is used in
// production by 5 working functions, forces `response_format: json_object`
// (wrong for a conversational/tool-calling reply, which can be plain text or
// a tool_calls array), and only ever sends a single system+user turn. This
// file is new code, not a refactor of that one.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export class GroqCallError extends Error {}

export interface GroqToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
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
  let res: Response
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        ...(opts.tools && opts.tools.length > 0
          ? { tools: opts.tools, tool_choice: 'auto' }
          : {}),
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    })
  } catch (e) {
    throw new GroqCallError(`network error calling Groq: ${e}`)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new GroqCallError(`Groq API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const message = data?.choices?.[0]?.message
  if (!message) throw new GroqCallError('Groq response had no message')
  return message as GroqMessage
}
