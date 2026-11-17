import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Check } from 'lucide-react'
import { useCoachChat } from '../hooks/useCoachChat'
import type { CoachChatMessage } from '../db'
import './CoachChat.css'

/** Short, human label for a tool-result chip — the raw tool name/JSON isn't
    meant for the user to see, just a quiet confirmation that something
    happened. Falls back to a generic "Done" rather than ever showing raw
    tool-call internals. */
function toolResultLabel(message: CoachChatMessage): string {
  const name = message.toolName ?? ''
  let parsed: { ok?: boolean; reason?: string } = {}
  try { parsed = message.content ? JSON.parse(message.content) : {} } catch { /* leave empty */ }

  if (parsed.ok === false) return parsed.reason ?? "Couldn't do that."

  switch (name) {
    case 'log_workout': return 'Logged workout'
    case 'log_meal': return 'Logged meal'
    case 'create_template': return 'Saved template'
    case 'update_nutrition_goals': return 'Updated nutrition goals'
    case 'update_goals': return 'Updated goals'
    case 'navigate_to': return 'Opened that screen'
    default: return 'Looked that up'
  }
}

export default function CoachChat() {
  const { messages, loaded, sending, sendMessage } = useCoachChat()
  const [input, setInput] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    void sendMessage(text)
  }

  // Tool-call-only assistant messages (content: null) are internal plumbing,
  // not something to render as an empty bubble — their tool-result messages
  // right after are what actually shows.
  const visible = messages.filter(m => !(m.role === 'assistant' && m.content == null))

  return (
    <div className="coach-chat">
      <div className="coach-chat-thread" ref={threadRef}>
        {loaded && visible.length === 0 && (
          <div className="coach-chat-empty">
            <Sparkles size={18} />
            <p>Ask about training or nutrition, or have me log something for you.</p>
          </div>
        )}
        {visible.map(m => (
          m.role === 'tool' ? (
            <div key={m.id} className="coach-msg coach-msg--tool">
              <Check size={12} /> {toolResultLabel(m)}
            </div>
          ) : (
            <div key={m.id} className={`coach-msg coach-msg--${m.role}`}>
              {m.content}
            </div>
          )
        ))}
        {sending && (
          <div className="coach-msg coach-msg--assistant coach-msg--typing">
            <span className="coach-typing-dot" />
            <span className="coach-typing-dot" />
            <span className="coach-typing-dot" />
          </div>
        )}
      </div>

      <div className="coach-chat-input-row">
        <input
          className="coach-chat-input"
          placeholder="Message Coach…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
          disabled={sending}
        />
        <button
          className="coach-chat-send"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
      <p className="coach-chat-disclaimer">
        General guidance based on common training and nutrition knowledge — not medical advice.
      </p>
    </div>
  )
}
