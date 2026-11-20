import { useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import CoachChat from '../components/CoachChat'
import { useCoachChat } from '../hooks/useCoachChat'
import './AICoach.css'

export default function AICoach() {
  const { messages, loaded, sending, sendMessage, actOnProposedWorkout, resetChat } = useCoachChat()
  const [confirmingClear, setConfirmingClear] = useState(false)

  async function handleClear() {
    await resetChat()
    setConfirmingClear(false)
  }

  return (
    <div className="ai-page">
      <header className="ai-header">
        <div className="ai-header-icon" aria-hidden="true">
          <Sparkles size={20} />
        </div>
        <h1 className="ai-title">Jeevan AI</h1>
        {messages.length > 0 && (
          confirmingClear ? (
            <div className="ai-clear-confirm">
              <span>Clear Chat History?</span>
              <button className="ai-clear-confirm-yes" onClick={() => void handleClear()}>Clear</button>
              <button className="ai-clear-confirm-no" onClick={() => setConfirmingClear(false)}>Cancel</button>
            </div>
          ) : (
            <button className="ai-clear-btn" onClick={() => setConfirmingClear(true)} aria-label="Clear Chat History" title="Clear Chat History">
              <Trash2 size={16} />
            </button>
          )
        )}
      </header>

      <CoachChat
        messages={messages}
        loaded={loaded}
        sending={sending}
        sendMessage={sendMessage}
        actOnProposedWorkout={actOnProposedWorkout}
      />
    </div>
  )
}
