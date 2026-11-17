// Supabase Edge Function: the Coach chat's only server-side piece. This app's
// real data (workouts, nutrition, profile) lives in the browser's IndexedDB,
// not in a database this function can reach — so it never touches any user
// data and never verifies a JWT (see supabase/config.toml: verify_jwt = false
// for this function, same as every other AI function in this project). It's
// a pure, stateless relay to Groq: given the running conversation and the
// tool definitions the client supports, return Groq's next message — plain
// text, or a tool_calls request. The client is what actually executes tools
// (calling the same saveWorkout/addNutritionEntry/etc. functions the rest of
// the app already uses) and feeds the results back in a follow-up call here.
//
// Contract: like parse-meal and friends, this never returns a hard error for
// anything recoverable — always a 200 with an assistant-shaped message (a
// soft fallback text reply on failure, never a dead-end error screen).

import { corsHeaders, jsonResponse } from '../_shared/http.ts'
import { callGroqChat, GroqCallError } from '../_shared/groqChat.ts'
import type { GroqMessage, GroqToolDef } from '../_shared/groqChat.ts'

// Groq's free-tier model lineup changes without much notice — override via
// `supabase secrets set GROQ_CHAT_MODEL=...` if this default gets retired.
// Llama 3.3 70B is Groq's best-documented function-calling model; kept
// separate from GROQ_TEXT_MODEL (used by parse-meal etc.) since that one is
// tuned for single-shot JSON extraction, not a multi-turn tool-calling chat.
const GROQ_MODEL = Deno.env.get('GROQ_CHAT_MODEL') || 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are the Coach inside Jeevan, a personal health and fitness app. You're talking directly with the user in a chat.

What you can do:
- Answer questions about training, nutrition, and recovery using what you actually know.
- Take real actions in their app when they ask — log a workout or meal, create a workout template, update their nutrition or weight/activity goals, or look up their own recent data — by calling the matching tool. Prefer calling a tool over describing what you would do; the user wants the action taken, not a description of it.
- Point them to the right screen (use the navigate_to tool) when that's genuinely more useful than doing it yourself.

How to talk:
- Be direct and warm, not clinical. Keep replies short unless the question genuinely needs more.
- Only state what you actually know. If you're not sure, say so — never invent a specific study, statistic, or citation to sound more authoritative.
- This is general, science-informed guidance, not medical advice — you don't need to repeat that disclaimer every message (the app already shows it once, persistently), but don't contradict it either: for anything that sounds like a real medical concern, say so plainly and suggest they talk to a doctor instead of trying to resolve it yourself.
- When you use a tool, keep your follow-up reply short and confirm what happened in plain language (e.g. "Logged it — nice work." not a recitation of every field).`

interface ChatRequestBody {
  messages?: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string | null
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
    toolCallId?: string
    toolName?: string
  }>
  tools?: GroqToolDef[]
}

function softFallback(text: string, origin: string | null): Response {
  return jsonResponse({ role: 'assistant', content: text }, 200, origin)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  }

  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) {
    return softFallback("Coach chat isn't set up yet — the app's AI backend needs a Groq API key configured.", origin)
  }

  let body: ChatRequestBody
  try {
    body = await req.json()
  } catch {
    return softFallback("Didn't quite catch that — try again?", origin)
  }

  const clientMessages = Array.isArray(body.messages) ? body.messages : []
  if (clientMessages.length === 0) {
    return softFallback("I didn't get a message to reply to.", origin)
  }

  // Translate the client's camelCase storage shape into Groq's wire format,
  // and prepend the fixed system prompt — always server-controlled, never
  // client-supplied, so it can't be overridden by a crafted request.
  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...clientMessages.map((m): GroqMessage => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls ? {
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.toolName ? { name: m.toolName } : {}),
    })),
  ]

  const tools = Array.isArray(body.tools) ? body.tools : undefined

  try {
    const reply = await callGroqChat({ apiKey, model: GROQ_MODEL, messages, tools })
    return jsonResponse(reply, 200, origin)
  } catch (e) {
    if (e instanceof GroqCallError) {
      console.error('Groq API error', e.message)
      return softFallback("Couldn't reach the Coach just now — try again in a moment.", origin)
    }
    console.error('chat-coach error', e)
    return softFallback('Something went wrong on that one — try again?', origin)
  }
})
