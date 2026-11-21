import { supabase, isSupabaseConfigured } from './supabase'
import type { CoachChatMessage } from '../db'
import { COACH_TOOLS } from './coachTools'

export const isCoachChatAvailable = isSupabaseConfigured

export interface CoachReplyToolCall {
  id: string
  name: string
  arguments: string
}

export interface CoachReply {
  content: string | null
  toolCalls?: CoachReplyToolCall[]
}

const SOFT_FAILURE: CoachReply = {
  content: "Couldn't reach Jeevan just now — try again in a moment.",
}

// Groq's free-tier TPM (tokens/minute) budget is small, and the system
// prompt + full tool schema already cost ~2700 tokens before a single
// message is sent — a long-running conversation resending its entire
// history every round was observed hitting a real 429 in production. This
// only trims what's SENT to Groq; the full history still lives in
// IndexedDB/the UI untouched. Cuts at a 'user' message boundary so a
// tool_calls/tool-result pair is never sent orphaned (which Groq would
// reject as a malformed conversation).
const MAX_SENT_MESSAGES = 16

function trimForWire(messages: CoachChatMessage[]): CoachChatMessage[] {
  if (messages.length <= MAX_SENT_MESSAGES) return messages
  const roughStart = messages.length - MAX_SENT_MESSAGES
  for (let i = roughStart; i < messages.length; i++) {
    if (messages[i].role === 'user') return messages.slice(i)
  }
  return messages
}

/** Sends the running conversation to the chat-coach Edge Function and
    returns the assistant's next message — plain text, or a request to run
    one or more tools. Never throws, per this app's "no dead-end error
    screens" rule — any failure just becomes a soft text reply. */
export async function sendToCoach(messages: CoachChatMessage[]): Promise<CoachReply> {
  if (!supabase) return { content: "Chat isn't available in this build." }

  const wire = trimForWire(messages).map(m => ({
    role: m.role,
    content: m.content,
    ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
    ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    ...(m.toolName ? { toolName: m.toolName } : {}),
    // Only matters server-side when it's the trailing message in the array —
    // true exactly on the round right after the user attaches a photo, since
    // later rounds in the same sendMessage() call only append assistant/tool
    // messages after it. Sent on every message that carries one regardless;
    // the server decides whether it's the latest.
    ...(m.imageDataUrl ? { imageDataUrl: m.imageDataUrl } : {}),
  }))

  type InvokeResult = {
    content: string | null
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
  }

  async function invokeOnce(): Promise<InvokeResult | null> {
    try {
      const clientTime = new Date().toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
      const { data, error } = await supabase!.functions.invoke<InvokeResult>(
        'chat-coach', { body: { messages: wire, tools: COACH_TOOLS, clientTime } }
      )
      return error || !data ? null : data
    } catch {
      return null
    }
  }

  // This outer hop (browser → edge function) had zero retry of its own —
  // any transient blip here (a cold start, a brief network hiccup) skipped
  // straight to the soft-failure message on the very first try, even though
  // groqChat.ts's retry logic inside the function never got a chance to run
  // for a failure at this layer. One light retry catches exactly that case
  // without adding much latency to a genuine failure.
  const data = await invokeOnce() ?? await (async () => {
    await new Promise(resolve => setTimeout(resolve, 800))
    return invokeOnce()
  })()

  if (!data) return SOFT_FAILURE

  return {
    content: data.content ?? null,
    toolCalls: data.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
  }
}
