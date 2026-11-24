import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import './ErrorBoundary.css'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="error-boundary">
        <AlertTriangle size={40} className="error-boundary-icon" />
        <h1>Something Went Wrong</h1>
        <p>An unexpected error occurred. Reloading usually fixes it — your data hasn't been lost.</p>
        <button className="error-boundary-btn" onClick={() => window.location.href = '/'}>
          Reload App
        </button>
      </div>
    )
  }
}
