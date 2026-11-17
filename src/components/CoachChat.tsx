import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Check } from 'lucide-react'
import { useCoachChat } from '../hooks/useCoachChat'
import type { CoachChatMessage } from '../db'
import './CoachChat.css'

/** Short, human label for a tool-result chip — the raw tool name/JSON isn't
    meant for the user to see, just a quiet confirmation that something
    happened. Falls back to a generic label rather than ever showing raw
    tool-call internals. */
function toolResultLabel(message: CoachChatMessage): string | null {
  const name = message.toolName ?? ''
  if (name === 'get_health_context') return null  // silent — a lookup isn't news

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

/** Minimal markdown-lite rendering for assistant replies — just the two
    things the system prompt is told to use: numbered steps and bulleted
    lists. Everything else stays as plain paragraphs. No library — this is
    a handful of lines for a narrow, known shape, not general markdown. */
function MessageBody({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: Array<{ type: 'p' | 'ul' | 'ol'; items: string[] }> = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const bullet = /^[-*]\s+(.*)/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)/.exec(line)
    const kind: 'p' | 'ul' | 'ol' = bullet ? 'ul' : numbered ? 'ol' : 'p'
    const content = bullet?.[1] ?? numbered?.[1] ?? line
    const last = blocks[blocks.length - 1]
    if (last && last.type === kind && kind !== 'p') {
      last.items.push(content)
    } else {
      blocks.push({ type: kind, items: [content] })
    }
  }

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return <ul key={i} className="coach-msg-list">{block.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        }
        if (block.type === 'ol') {
          return <ol key={i} className="coach-msg-list">{block.items.map((it, j) => <li key={j}>{it}</li>)}</ol>
        }
        return <p key={i} className="coach-msg-p">{block.items[0]}</p>
      })}
    </>
  )
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
  // right after are what actually shows. Silent lookups (get_health_context)
  // don't get a chip at all — they're not news to the user.
  const visible = messages.filter(m => {
    if (m.role === 'assistant' && m.content == null) return false
    if (m.role === 'tool' && toolResultLabel(m) == null) return false
    return true
  })

  return (
    <div className="coach-chat">
      <div className="coach-chat-thread" ref={threadRef}>
        {loaded && visible.length === 0 && (
          <div className="coach-chat-empty">
            <Sparkles size={20} />
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
              {m.role === 'assistant'
                ? <MessageBody text={m.content ?? ''} />
                : m.content}
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

      <div className="coach-chat-input-wrap">
        <div className="coach-chat-input-row">
          <input
            className="coach-chat-input"
            placeholder="Message Jeevan…"
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
          General guidance, not medical advice.
        </p>
      </div>
    </div>
  )
}
