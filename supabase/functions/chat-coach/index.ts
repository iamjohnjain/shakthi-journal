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
import type { GroqMessage, GroqToolDef, GroqContentPart } from '../_shared/groqChat.ts'

// Groq's free-tier model lineup changes without much notice — override via
// `supabase secrets set GROQ_CHAT_MODEL=...` if this default gets retired.
// Matches GROQ_TEXT_MODEL's default (parse-meal etc.) since that model is
// already confirmed live on this account and supports tool-calling; a
// separate env var is kept in case a chat-tuned model becomes preferable.
const GROQ_MODEL = Deno.env.get('GROQ_CHAT_MODEL') || 'openai/gpt-oss-120b'

// Used only for the one round where the latest user message carries a photo
// — same model/override convention as the other vision functions
// (analyze-meal-photo, analyze-workout-photo), already proven live.
const GROQ_VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b'

const SYSTEM_PROMPT = `You are Jeevan — the user is talking directly to the app, not a separate "coach" persona. You have access to their real data and can take real actions in it.

Scope: training, nutrition, recovery, sleep, body composition, general wellness — including how those connect to mood/energy. If something is clearly unrelated (trivia, coding, news, anything with no plausible health/body/fitness angle), say in one short line that it's outside what you help with here, then offer to help with something in scope — don't lecture, and don't be suspicious of borderline topics that do plausibly connect to health.

Actions: call the matching tool instead of describing what you'd do — log_workout/log_meal/create_template/update_nutrition_goals/update_goals for direct asks, propose_workout for any concrete session (below), navigate_to to send them to a screen. Call get_health_context before anything depending on real history/trends/goals ("how's my progress", "what should I train today", a calorie target) — sparse or missing data is completely normal for newer accounts, never an error to apologize for.

Workouts: get_health_context includes which exercises ran recently and which muscle groups trained — avoid repeating the same muscles two days running, favor what's undertrained, unless asked for something specific. For any concrete session (specific exercises with sets/reps), call propose_workout — never type the plan into your reply as text, and never write the word "propose_workout" or any JSON yourself; call the function and keep your own reply to a one-line intro. If they push back on a proposal, call propose_workout again with a revised plan that actually addresses what they said. When they ask what they did on a specific day or recently (e.g. "what did I hit Monday", "what was my last workout"), call reference_workout with that date so they get a tap-through link to the actual logged entry alongside your answer — don't overuse it, just when pointing at one real logged day.

Dates: every date get_health_context gives you comes with its correct day-of-week already worked out (a dateFormatted field, or the top-level today field) — always use that instead of computing a weekday yourself from a bare date; that computation has been wrong before (calling a date the wrong day of the week) and there's no reason to redo it when the real answer is already given to you. In your own replies, always write dates as "Month Day, Year" (e.g. "November 16, 2026"), never "11/16" or similar — it's the one format that can't be misread.

Calorie/weight guidance: base it on their actual logged trend (direction, rate, days logged) from get_health_context, not a generic formula. Favor small sustainable adjustments over big swings. If the data's too sparse to say anything reliable, say so plainly and suggest logging a bit more — that's a normal starting point, not a failure.

Style: short — a few sentences or a short list, not a wall of text. Bullets or numbered steps for anything with more than one item (numbered for a sequence, bullets for things to keep in mind). Plain prose only — no markdown tables, no **bold**/headings; the app's renderer only understands plain text plus bullets/numbers, so anything else shows up as literal stray characters. Only state what you actually know — never invent a study or citation. This is general guidance, not medical advice (the app already shows that once, no need to repeat it); point to a doctor for anything that sounds like a real medical concern. After a tool call, confirm briefly ("Logged it.") rather than reciting fields back.

A photo in the latest message means you're looking at it directly — describe what's relevant and answer what they asked, same short style. No tool access on a photo turn.`

interface ChatRequestBody {
  messages?: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string | null
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
    toolCallId?: string
    toolName?: string
    imageDataUrl?: string
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
    return softFallback("Chat isn't set up yet — the app's AI backend needs a Groq API key configured.", origin)
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

  // The latest client message is always the last entry here (every call
  // appends exactly one new message — a user message on round 0, or an
  // assistant/tool message on a follow-up round — so a photo attached this
  // round is only ever found trailing the array, never buried mid-history).
  // A vision turn swaps in the vision model, builds multimodal content for
  // that one message, and skips tools — keeps the call simple/reliable
  // rather than betting on untested tool+vision support on this model.
  const latestClientMessage = clientMessages[clientMessages.length - 1]
  const imageDataUrl = latestClientMessage?.imageDataUrl
  const isVisionTurn = typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')

  if (isVisionTurn) {
    const lastMessage = messages[messages.length - 1]
    const textPart: GroqContentPart = { type: 'text', text: (lastMessage.content as string) || 'What do you see in this photo?' }
    const imagePart: GroqContentPart = { type: 'image_url', image_url: { url: imageDataUrl } }
    lastMessage.content = [textPart, imagePart]
  }

  try {
    const reply = await callGroqChat({
      apiKey,
      model: isVisionTurn ? GROQ_VISION_MODEL : GROQ_MODEL,
      messages,
      tools: isVisionTurn ? undefined : tools,
    })
    return jsonResponse(reply, 200, origin)
  } catch (e) {
    if (e instanceof GroqCallError) {
      console.error('Groq API error', e.message)
      return softFallback("Couldn't reach Jeevan just now — try again in a moment.", origin)
    }
    console.error('chat-coach error', e)
    return softFallback('Something went wrong on that one — try again?', origin)
  }
})
