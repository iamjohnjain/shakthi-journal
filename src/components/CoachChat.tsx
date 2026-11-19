import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Sparkles, Check, Mic, Plus, Camera, Image as ImageIcon, FileText, X, ExternalLink } from 'lucide-react'
import { useCoachChat } from '../hooks/useCoachChat'
import { formatFullDate } from '../data/config'
import { useVoiceDictation } from '../hooks/useVoiceDictation'
import { compressImageToDataUrl } from '../lib/imageUtils'
import type { CoachChatMessage } from '../db'
import LiveCamera from './LiveCamera'
import VoiceListeningOverlay from './VoiceListeningOverlay'
import './CoachChat.css'

// Same allow-list already proven for workout-plan imports (fileTextExtract.ts
// handles all of these: PDFs, Word docs, plain text, or images — including
// scanned/image-only PDF pages). Safety cap below it: a hard ceiling on the
// raw file, independent of fileTextExtract's own internal compression, so a
// huge upload fails fast with a clear message instead of hanging or
// silently never completing.
const UPLOAD_ACCEPT = 'image/*,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.csv,.md,text/plain,text/csv'
const MAX_UPLOAD_BYTES = 15_000_000

const STARTER_PROMPTS = [
  'Suggest a workout for today',
  'Help me set a goal',
  'What should I eat today?',
  "How's my progress?",
]

/** Short, human label for a tool-result chip — the raw tool name/JSON isn't
    meant for the user to see, just a quiet confirmation that something
    happened. Falls back to a generic label rather than ever showing raw
    tool-call internals. */
function toolResultLabel(message: CoachChatMessage): string | null {
  const name = message.toolName ?? ''
  if (name === 'get_health_context') return null  // silent — a lookup isn't news
  if (name === 'propose_workout') return null      // silent — the action buttons under the message are the real UI
  if (name === 'reference_workout') return null    // silent — the link chip under the message is the real UI

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

/** Strips the inline markdown the model is told not to use but sometimes
    emits anyway — paired `**bold**`/`__bold__` markers and leading `#`
    headings — never trust a model to fully obey formatting instructions. */
function stripInlineMarkdown(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/, '')
}

/** A markdown table's separator row (`|---|:---:|---|`) carries no content —
    skip it outright rather than rendering literal dashes/pipes. */
function isTableSeparatorLine(line: string): boolean {
  return line.includes('-') && /^[\s|:-]+$/.test(line)
}

/** A markdown table data row (`| Exercise | Sets | Tip |`) — turned into one
    bullet-friendly string instead of a paragraph full of literal pipes. The
    system prompt asks the model not to use tables at all, but this is the
    fallback for when it does anyway. */
function tableRowToText(line: string): string | null {
  const match = /^\|(.+)\|$/.exec(line)
  if (!match) return null
  const cells = match[1].split('|').map(c => c.trim()).filter(Boolean)
  return cells.length > 0 ? cells.join(' — ') : null
}

/** Minimal markdown-lite rendering for assistant replies — just the two
    things the system prompt is told to use: numbered steps and bulleted
    lists (plus graceful fallbacks for stray bold/table syntax above).
    Everything else stays as plain paragraphs. No library — this is a
    handful of lines for a narrow, known shape, not general markdown. */
function MessageBody({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: Array<{ type: 'p' | 'ul' | 'ol'; items: string[] }> = []

  for (const raw of lines) {
    let line = raw.trim()
    if (!line) continue
    if (isTableSeparatorLine(line)) continue
    line = stripInlineMarkdown(line)

    const tableRow = tableRowToText(line)
    const bullet = /^[-*]\s+(.*)/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)/.exec(line)
    const kind: 'p' | 'ul' | 'ol' = tableRow ? 'ul' : bullet ? 'ul' : numbered ? 'ol' : 'p'
    const content = tableRow ?? bullet?.[1] ?? numbered?.[1] ?? line
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
  const navigate = useNavigate()
  const { messages, loaded, sending, sendMessage, actOnProposedWorkout } = useCoachChat()
  const [input, setInput] = useState('')
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [pendingDocument, setPendingDocument] = useState<{ fileName: string; text: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { listening, phase: micPhase, stream: micStream, toggle: toggleMic, supported: micSupported } = useVoiceDictation(
    t => setInput(cur => (cur ? `${cur} ${t}` : t))
  )

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  function handleSend() {
    const typed = input.trim()
    if ((!typed && !pendingImage && !pendingDocument) || sending) return
    const text = pendingDocument
      ? `${typed ? `${typed}\n\n` : ''}[Uploaded document: ${pendingDocument.fileName}]\n${pendingDocument.text}`
      : typed
    const image = pendingImage ?? undefined
    setInput('')
    setPendingImage(null)
    setPendingDocument(null)
    void sendMessage(text, image)
  }

  async function handleFileChosen(file: File) {
    setShowAttachMenu(false)
    setFileError(null)
    setPendingImage(null)
    setPendingDocument(null)

    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError(`That file's a bit large (max ${Math.round(MAX_UPLOAD_BYTES / 1_000_000)}MB) — try a smaller one.`)
      return
    }

    // A plain image from "Choose from Library" is the common case and
    // doesn't need the heavier pdfjs/mammoth path at all.
    if (file.type.startsWith('image/')) {
      setPendingImage(await compressImageToDataUrl(file))
      return
    }

    // Dynamically imported — pdfjs-dist/mammoth are heavy and most chat
    // uploads are images, so this shouldn't be in the main bundle everyone
    // downloads on every page load. Same utility already proven for
    // workout-plan template imports.
    const { extractFileContent } = await import('../lib/fileTextExtract')
    const extracted = await extractFileContent(file)
    if (!extracted) {
      setFileError("Couldn't read that file — try a PDF, Word doc, text file, or image instead.")
      return
    }
    if (extracted.kind === 'image') {
      setPendingImage(extracted.dataUrls[0])
    } else {
      // Capped — an unbounded PDF/doc dump risks the same Groq token-budget
      // problem the chat's history-trimming already guards against
      // elsewhere (coachChatApi.ts). Plenty of room for an actual workout
      // plan; just not an entire book.
      const MAX_DOC_CHARS = 6000
      const text = extracted.text.length > MAX_DOC_CHARS
        ? `${extracted.text.slice(0, MAX_DOC_CHARS)}\n\n[...truncated, document was longer]`
        : extracted.text
      setPendingDocument({ fileName: file.name, text })
    }
  }

  // Tool-call-only assistant messages (content: null) are internal plumbing,
  // not something to render as an empty bubble — their tool-result messages
  // right after are what actually shows. The one exception is a
  // propose_workout call: content is still null (it's a pure tool call,
  // same as any other), but proposedWorkout is the actual thing the user
  // needs to see — the whole point of the action-button card. Silent
  // lookups (get_health_context) don't get a chip at all — not news to the user.
  const visible = messages.filter(m => {
    if (m.role === 'assistant' && m.content == null && !m.proposedWorkout) return false
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
            <div className="coach-chat-starters">
              {STARTER_PROMPTS.map(prompt => (
                <button key={prompt} className="coach-chat-starter" onClick={() => void sendMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {visible.map(m => (
          m.role === 'tool' ? (
            <div key={m.id} className="coach-msg coach-msg--tool">
              <Check size={12} /> {toolResultLabel(m)}
            </div>
          ) : (
            <div key={m.id} className={`coach-msg coach-msg--${m.role}`}>
              {m.imageDataUrl && <img src={m.imageDataUrl} alt="" className="coach-msg-image" />}
              {m.role === 'assistant'
                ? <MessageBody text={m.content ?? ''} />
                : m.content}
              {m.proposedWorkout && (
                <div className={`coach-proposal ${m.content ? '' : 'coach-proposal--standalone'}`}>
                  <div className="coach-proposal-title">{m.proposedWorkout.title}</div>
                  <ul className="coach-proposal-exercises">
                    {m.proposedWorkout.exercises.map((ex, i) => (
                      <li key={i}>{ex.name} — {ex.sets.length}×{ex.sets[0]?.reps ?? '?'}</li>
                    ))}
                  </ul>
                  {m.proposedWorkoutActedAs ? (
                    <div className="coach-proposal-done">
                      <Check size={12} /> {m.proposedWorkoutActedAs === 'template' ? 'Saved as template' : 'Logged for today'}
                    </div>
                  ) : (
                    <div className="coach-proposal-actions">
                      <button
                        disabled={actingOn === m.id}
                        onClick={async () => { setActingOn(m.id); await actOnProposedWorkout(m.id, 'template'); setActingOn(null) }}
                      >
                        Save as Template
                      </button>
                      <button
                        disabled={actingOn === m.id}
                        onClick={async () => { setActingOn(m.id); await actOnProposedWorkout(m.id, 'logged'); setActingOn(null) }}
                      >
                        Log for Today
                      </button>
                    </div>
                  )}
                </div>
              )}
              {m.workoutReference && (
                <button
                  className="coach-workout-link"
                  onClick={() => navigate(`/workouts?date=${m.workoutReference!.date}`)}
                >
                  <ExternalLink size={12} />
                  {m.workoutReference.label || 'View workout'} — {formatFullDate(m.workoutReference.date)}
                </button>
              )}
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
        {pendingImage && (
          <div className="coach-chat-pending-image">
            <img src={pendingImage} alt="" />
            <button onClick={() => setPendingImage(null)} aria-label="Remove photo"><X size={13} /></button>
          </div>
        )}
        {pendingDocument && (
          <div className="coach-chat-pending-doc">
            <FileText size={16} />
            <span className="coach-chat-pending-doc-name">{pendingDocument.fileName}</span>
            <button onClick={() => setPendingDocument(null)} aria-label="Remove file"><X size={13} /></button>
          </div>
        )}
        {fileError && <p className="coach-chat-file-error">{fileError}</p>}

        {showAttachMenu && (
          <div className="coach-chat-attach-menu">
            <button onClick={() => { setShowAttachMenu(false); setShowCamera(true) }}>
              <Camera size={15} /> Take Photo
            </button>
            <button onClick={() => fileInputRef.current?.click()}>
              <ImageIcon size={15} /> Choose from Library
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileChosen(f) }}
        />

        <div className="coach-chat-input-row">
          <button
            className="coach-chat-attach"
            onClick={() => setShowAttachMenu(v => !v)}
            aria-label="Attach a photo or file"
          >
            <Plus size={17} />
          </button>
          <input
            className="coach-chat-input"
            placeholder="Message Jeevan…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            disabled={sending}
          />
          {micSupported && (
            <button
              className={`coach-chat-mic ${listening ? 'coach-chat-mic--active' : ''}`}
              onClick={toggleMic}
              aria-label="Dictate"
              type="button"
            >
              <Mic size={16} />
            </button>
          )}
          <button
            className="coach-chat-send"
            onClick={handleSend}
            disabled={sending || (!input.trim() && !pendingImage && !pendingDocument)}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="coach-chat-disclaimer">
          General guidance, not medical advice.
        </p>
      </div>

      {showCamera && (
        <LiveCamera
          onCapture={async blob => { setShowCamera(false); const dataUrl = await compressImageToDataUrl(blob); setPendingImage(dataUrl) }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {listening && (
        <VoiceListeningOverlay stream={micStream} phase={micPhase} onStop={toggleMic} />
      )}
    </div>
  )
}
