// Shared Groq chat-completions caller — every AI edge function (meal or
// workout, text or vision) goes through this so the fetch/error handling
// lives in exactly one place instead of being re-copied per function.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export class GroqCallError extends Error {}

/** Calls Groq's OpenAI-compatible chat completions endpoint and returns the
    model's raw text content. `imageDataUrl`, when given, turns the user
    message into a multimodal `[{text}, {image_url}]` content array for a
    vision-capable model — otherwise it's a plain string. Throws
    `GroqCallError` on any non-OK response or network failure; callers are
    expected to catch it and fall back to a soft (never a hard error)
    response, per this app's "no dead-end error screens" rule. */
export async function callGroq(opts: {
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  imageDataUrl?: string
  temperature?: number
}): Promise<string> {
  const userContent = opts.imageDataUrl
    ? [
        { type: 'text', text: opts.userText },
        { type: 'image_url', image_url: { url: opts.imageDataUrl } },
      ]
    : opts.userText

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
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: opts.temperature ?? 0.2,
        response_format: { type: 'json_object' },
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
  return data?.choices?.[0]?.message?.content ?? ''
}
