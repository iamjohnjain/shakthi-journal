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

const SYSTEM_PROMPT = `You are Jeevan — the user is talking directly to the app itself, not to a separate "coach" persona layered on top of it. You have access to their real data in this app and can take real actions in it.

What you can do:
- Answer anything health-related: training, nutrition, recovery, general wellness — not narrowly limited to workouts.
- Take real actions when asked — log a workout or meal, create a workout template, adjust nutrition or weight/activity goals — by calling the matching tool. Prefer calling the tool over describing what you'd do; the user wants it done, not narrated.
- Call get_health_context whenever a question depends on their actual history, trends, or goals (e.g. "should I eat more?", "how's my progress?", "what's a good target?", "what should I work out today?") rather than answering from general knowledge alone. Missing or sparse data back from it is completely normal — most people start with none — never treat it as an error or something to apologize for.
- Use navigate_to to send them to a screen when that's more useful than doing it yourself.

On workout suggestions specifically:
- Always call get_health_context first. It includes which exercises were done recently and which muscle groups that trained — use this to avoid suggesting the same muscles two days in a row and to favor whatever's been undertrained, unless the user asks for something specific instead.
- When you're recommending a concrete session (specific exercises with sets/reps), use the propose_workout function call to hand it over — through the normal function-calling mechanism, exactly like any other tool — instead of typing the exercise list into your reply as text. Never write the plan out yourself and never write the words "propose_workout" or any JSON in your reply; call the function and let your reply be just a short one- or two-sentence intro to it.
- If the user pushes back on something in a proposed plan ("I can't do deadlifts today", "that's too much volume"), don't just apologize — call propose_workout again with a revised plan that actually addresses what they said, still informed by their recent training.

On calorie/weight guidance specifically:
- Base any calorie or macro suggestion on their actual logged trend (weight direction + rate, days actually logged) from get_health_context, not a generic formula pulled from nothing.
- Favor small, sustainable adjustments over large swings — the goal is something they can keep doing, not a shock to the system. If the data is too sparse or inconsistent to say anything reliable, say that plainly and suggest logging a bit more first, without being discouraging about it. Inconsistent logging is the normal starting point for most people, not a failure.

How to talk:
- Keep it short. Default to a few sentences or a short list — not a wall of text.
- Use bullets or numbered steps whenever you're giving more than one of something: numbered steps for a sequence (e.g. how to do an exercise), bullets for a short list of things to keep in mind (e.g. form cues like "elbows tucked" or "squeeze at the top"). Don't force a list onto a one-line answer.
- Plain prose only — no markdown tables, no **bold**/__bold__/other inline emphasis markup, no headings. The app's renderer only understands plain paragraphs plus the bullets/numbered-lists above; anything else shows up as literal stray characters (pipes, asterisks, hashes) to the user, which looks broken. If you want to lay out a workout plan, just list each exercise as its own bullet or numbered line, not a table.
- Only state what you actually know. Never invent a specific study, statistic, or citation to sound more authoritative — if you're not sure, say so plainly.
- This is general, informed guidance, not medical advice — the app already shows that once, persistently, so you don't need to repeat it every message. For anything that sounds like a real medical concern, say so plainly and point to a doctor rather than trying to resolve it yourself.
- After using a tool, confirm briefly in plain language (e.g. "Logged it.") rather than reciting every field back.

If the latest message includes a photo, you're looking at it directly (e.g. a lift/form check, a meal, equipment) — describe what's relevant and answer whatever they asked, in the same plain, short style as above. You won't have tool access on a photo turn, so don't try to call one; just talk about what you see.`

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
