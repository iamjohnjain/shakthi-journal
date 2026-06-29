import { useState } from 'react'
import { Sparkles, Send, ChevronRight } from 'lucide-react'
import './AICoach.css'

const PROMPTS = [
  'Should I train hard today?',
  'Why is my weight stalling?',
  'What should I eat before a run?',
  'How can I improve my sleep?',
  'Am I overtraining?',
  'How do I increase my vertical jump?',
]

interface Message {
  role: 'user' | 'assistant'
  text: string
}

const INTRO: Message = {
  role: 'assistant',
  text: "Hi John! I'm your AI Health Coach. Once connected to your live data, I'll analyze your workouts, nutrition, sleep, recovery, and trends to give you personalized daily guidance. Ask me anything about your health goals.",
}

export default function AICoach() {
  const [messages, setMessages] = useState<Message[]>([INTRO])
  const [input, setInput] = useState('')

  function handlePrompt(prompt: string) {
    setMessages(prev => [
      ...prev,
      { role: 'user', text: prompt },
      { role: 'assistant', text: "Great question! AI responses will be powered by your real health data once connected. For now, this is a preview of the experience — responses will be personalized to your specific metrics, trends, and goals." },
    ])
  }

  function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    handlePrompt(text)
  }

  return (
    <div className="ai-page">

      <header className="ai-header">
        <div className="ai-header-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <h1 className="ai-title">AI Coach</h1>
          <p className="ai-subtitle">Your personalized health intelligence</p>
        </div>
        <span className="ai-badge">Coming Soon</span>
      </header>

      {/* Suggested prompts */}
      {messages.length <= 1 && (
        <div className="ai-prompts-section">
          <p className="ai-prompts-label">Try asking</p>
          <div className="ai-prompts-grid">
            {PROMPTS.map(p => (
              <button key={p} className="ai-prompt-card" onClick={() => handlePrompt(p)}>
                <span>{p}</span>
                <ChevronRight size={14} className="ai-prompt-arrow" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {messages.map((m, i) => (
          <div key={i} className={`ai-message ai-message--${m.role}`}>
            {m.role === 'assistant' && (
              <div className="ai-message-avatar">
                <Sparkles size={13} />
              </div>
            )}
            <div className="ai-message-bubble">
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="ai-input-bar">
        <input
          className="ai-input"
          placeholder="Ask about your health, training, nutrition…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button
          className={`ai-send-btn ${input.trim() ? 'enabled' : ''}`}
          onClick={handleSend}
          disabled={!input.trim()}
        >
          <Send size={16} />
        </button>
      </div>

    </div>
  )
}
