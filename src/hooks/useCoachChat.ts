import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CoachChatMessage, CoachProposedWorkout } from '../db'
import { getChatHistory, saveChatMessage, clearChatHistory } from '../db/chatStore'
import { sendToCoach } from '../lib/coachChatApi'
import { TOOL_EXECUTORS } from '../lib/coachTools'
import { saveWorkout } from '../db/workoutStore'
import { workoutToTemplate } from '../db/templateStore'
import { localDateStr } from '../data/config'

const MAX_TOOL_ROUNDS = 5

function genId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function userMessage(text: string, imageDataUrl?: string): CoachChatMessage {
  return {
    id: genId(),
    createdAt: new Date().toISOString(),
    role: 'user',
    content: text,
    ...(imageDataUrl ? { imageDataUrl } : {}),
  }
}

/** Pulls a `propose_workout` call's parsed args off an assistant message's
    tool_calls, if present — stashed as `proposedWorkout` so CoachChat can
    render Save/Log action buttons without re-parsing tool-call internals. */
function extractProposedWorkout(toolCalls: CoachChatMessage['toolCalls']): CoachProposedWorkout | undefined {
  const call = toolCalls?.find(c => c.name === 'propose_workout')
  if (!call) return undefined
  try {
    const args = JSON.parse(call.arguments || '{}')
    if (!args.title || !Array.isArray(args.exercises)) return undefined
    return { title: String(args.title), exercises: args.exercises, notes: typeof args.notes === 'string' ? args.notes : undefined }
  } catch {
    return undefined
  }
}

/** Same pattern as extractProposedWorkout, for `reference_workout`. */
function extractWorkoutReference(toolCalls: CoachChatMessage['toolCalls']): CoachChatMessage['workoutReference'] {
  const call = toolCalls?.find(c => c.name === 'reference_workout')
  if (!call) return undefined
  try {
    const args = JSON.parse(call.arguments || '{}')
    if (typeof args.date !== 'string' || !args.date) return undefined
    return { date: args.date, label: typeof args.label === 'string' ? args.label : undefined }
  } catch {
    return undefined
  }
}

export function useCoachChat() {
  const [messages, setMessages] = useState<CoachChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()
  // Avoids a stale-closure read of `messages` mid-loop — each round needs the
  // full history-so-far, including messages appended earlier in this same
  // call, before React has necessarily re-rendered.
  const historyRef = useRef<CoachChatMessage[]>([])

  useEffect(() => {
    getChatHistory().then(history => {
      historyRef.current = history
      setMessages(history)
      setLoaded(true)
    })
  }, [])

  const appendAndPersist = useCallback(async (message: CoachChatMessage) => {
    historyRef.current = [...historyRef.current, message]
    setMessages(historyRef.current)
    await saveChatMessage(message)
  }, [])

  const sendMessage = useCallback(async (text: string, imageDataUrl?: string) => {
    const trimmed = text.trim()
    if (!trimmed && !imageDataUrl) return
    if (sending) return
    setSending(true)
    try {
      await appendAndPersist(userMessage(trimmed, imageDataUrl))

      // reference_workout is meant to accompany the model's actual text
      // answer ("alongside your reply, not instead of it" per its own tool
      // description) — but tool-calling rounds and the final text reply are
      // always separate messages, so a reference called mid-loop has to be
      // carried forward and attached to whichever message ends up being
      // the final text reply, not left stranded on a content:null message.
      let pendingWorkoutReference: CoachChatMessage['workoutReference']

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await sendToCoach(historyRef.current)

        if (!reply.toolCalls || reply.toolCalls.length === 0) {
          await appendAndPersist({
            id: genId(),
            createdAt: new Date().toISOString(),
            role: 'assistant',
            content: reply.content ?? "I didn't catch that — can you try again?",
            workoutReference: pendingWorkoutReference,
          })
          return
        }

        pendingWorkoutReference = extractWorkoutReference(reply.toolCalls) ?? pendingWorkoutReference

        await appendAndPersist({
          id: genId(),
          createdAt: new Date().toISOString(),
          role: 'assistant',
          content: reply.content,
          toolCalls: reply.toolCalls,
          proposedWorkout: extractProposedWorkout(reply.toolCalls),
        })

        for (const call of reply.toolCalls) {
          const executor = TOOL_EXECUTORS[call.name]
          let result: unknown
          try {
            const args = JSON.parse(call.arguments || '{}')
            result = executor
              ? await executor(args, { navigate })
              : { ok: false, reason: 'Unknown tool.' }
          } catch (e) {
            result = { ok: false, reason: e instanceof Error ? e.message : 'Tool failed.' }
          }
          await appendAndPersist({
            id: genId(),
            createdAt: new Date().toISOString(),
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: call.id,
            toolName: call.name,
          })
        }
      }

      // Hit the round cap without a final text reply — close the loop out
      // with something rather than leaving the user staring at tool chips.
      await appendAndPersist({
        id: genId(),
        createdAt: new Date().toISOString(),
        role: 'assistant',
        content: "Done with what I could — let me know if you need anything else.",
        workoutReference: pendingWorkoutReference,
      })
    } finally {
      setSending(false)
    }
  }, [sending, appendAndPersist, navigate])

  /** User tapped "Save as Template" or "Log for Today" under a proposed
      workout. Writes directly to the real store — no further LLM round-trip,
      so there's no hallucination risk on the actual save — then marks the
      message acted-on (so the buttons don't fire twice) and drops a
      confirmation pill, reusing the exact same tool-result rendering a
      model-initiated log_workout/create_template already gets. */
  const actOnProposedWorkout = useCallback(async (messageId: string, action: 'template' | 'logged') => {
    const message = historyRef.current.find(m => m.id === messageId)
    const proposed = message?.proposedWorkout
    if (!message || !proposed || message.proposedWorkoutActedAs) return

    let result: unknown
    try {
      if (action === 'template') {
        const template = await workoutToTemplate(proposed.title, proposed.exercises, { notes: proposed.notes })
        result = { ok: true, id: template.id, name: template.name }
      } else {
        const totalSets = proposed.exercises.reduce((sum, e) => sum + e.sets.length, 0)
        const session = await saveWorkout({
          date: localDateStr(),
          type: 'lifting',
          title: proposed.title,
          durationMin: totalSets > 0 ? totalSets * 4 : 30,
          exercises: proposed.exercises,
          notes: proposed.notes,
        })
        result = { ok: true, id: session.id, title: session.title }
      }
    } catch (e) {
      result = { ok: false, reason: e instanceof Error ? e.message : 'Could not save that.' }
    }

    const updated: CoachChatMessage = { ...message, proposedWorkoutActedAs: action }
    historyRef.current = historyRef.current.map(m => (m.id === messageId ? updated : m))
    setMessages(historyRef.current)
    await saveChatMessage(updated)

    await appendAndPersist({
      id: genId(),
      createdAt: new Date().toISOString(),
      role: 'tool',
      content: JSON.stringify(result),
      toolCallId: `local_${action}_${messageId}`,
      toolName: action === 'template' ? 'create_template' : 'log_workout',
    })
  }, [appendAndPersist])

  const resetChat = useCallback(async () => {
    await clearChatHistory()
    historyRef.current = []
    setMessages([])
  }, [])

  return { messages, loaded, sending, sendMessage, resetChat, actOnProposedWorkout }
}
