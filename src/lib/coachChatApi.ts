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

/** Sends the running conversation to the chat-coach Edge Function and
    returns the assistant's next message — plain text, or a request to run
    one or more tools. Never throws, per this app's "no dead-end error
    screens" rule — any failure just becomes a soft text reply. */
export async function sendToCoach(messages: CoachChatMessage[]): Promise<CoachReply> {
  if (!supabase) return { content: "Chat isn't available in this build." }

  const wire = messages.map(m => ({
    role: m.role,
    content: m.content,
    ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
    ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    ...(m.toolName ? { toolName: m.toolName } : {}),
  }))

  try {
    const { data, error } = await supabase.functions.invoke<{
      content: string | null
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
    }>('chat-coach', { body: { messages: wire, tools: COACH_TOOLS } })

    if (error || !data) return SOFT_FAILURE

    return {
      content: data.content ?? null,
      toolCalls: data.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    }
  } catch {
    return SOFT_FAILURE
  }
}
