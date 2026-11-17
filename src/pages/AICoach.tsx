import { Sparkles } from 'lucide-react'
import CoachChat from '../components/CoachChat'
import './AICoach.css'

export default function AICoach() {
  return (
    <div className="ai-page">
      <header className="ai-header">
        <div className="ai-header-icon" aria-hidden="true">
          <Sparkles size={20} />
        </div>
        <h1 className="ai-title">Jeevan AI</h1>
      </header>

      <CoachChat />
    </div>
  )
}
