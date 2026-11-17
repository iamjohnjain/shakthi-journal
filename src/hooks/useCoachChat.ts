import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CoachChatMessage } from '../db'
import { getChatHistory, saveChatMessage, clearChatHistory } from '../db/chatStore'
import { sendToCoach } from '../lib/coachChatApi'
import { TOOL_EXECUTORS } from '../lib/coachTools'

const MAX_TOOL_ROUNDS = 5

function genId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function userMessage(text: string): CoachChatMessage {
  return { id: genId(), createdAt: new Date().toISOString(), role: 'user', content: text }
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

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await appendAndPersist(userMessage(trimmed))

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await sendToCoach(historyRef.current)

        if (!reply.toolCalls || reply.toolCalls.length === 0) {
          await appendAndPersist({
            id: genId(),
            createdAt: new Date().toISOString(),
            role: 'assistant',
            content: reply.content ?? "I didn't catch that — can you try again?",
          })
          return
        }

        await appendAndPersist({
          id: genId(),
          createdAt: new Date().toISOString(),
          role: 'assistant',
          content: reply.content,
          toolCalls: reply.toolCalls,
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
      })
    } finally {
      setSending(false)
    }
  }, [sending, appendAndPersist, navigate])

  const resetChat = useCallback(async () => {
    await clearChatHistory()
    historyRef.current = []
    setMessages([])
  }, [])

  return { messages, loaded, sending, sendMessage, resetChat }
}
