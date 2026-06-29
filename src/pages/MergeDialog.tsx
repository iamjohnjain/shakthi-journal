import { useState } from 'react'
import { AlertTriangle, Loader } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { MergeChoice } from '../context/AuthContext'
import './MergeDialog.css'

export default function MergeDialog() {
  const { pendingMerge, resolveMerge } = useAuth()
  const [choice, setChoice] = useState<MergeChoice>('merge')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!pendingMerge) return null

  const { user, localData } = pendingMerge
  const totalLocal = localData.workouts + localData.nutritionEntries + localData.dailyLogs

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      await resolveMerge(choice)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      setLoading(false)
    }
  }

  return (
    <div className="merge-overlay">
      <div className="merge-dialog">
        <div className="merge-header">
          <AlertTriangle size={18} className="merge-header-icon" />
          <h2>This device has local data</h2>
        </div>

        <p className="merge-desc">
          Signing in as <strong>{user.email ?? user.displayName ?? user.id.slice(0, 8)}</strong>
          {' '}but this device already has <strong>{totalLocal} records</strong> not yet in the cloud
          ({localData.workouts} workouts, {localData.dailyLogs} daily logs, {localData.nutritionEntries} nutrition entries).
        </p>
        <p className="merge-desc merge-desc--sub">
          Choose how to handle the conflict. This cannot be undone.
        </p>

        <div className="merge-options">
          <button
            className={`merge-opt ${choice === 'merge' ? 'merge-opt--on' : ''}`}
            onClick={() => setChoice('merge')}
          >
            <div className="merge-opt-title">Merge</div>
            <div className="merge-opt-desc">Add cloud records not found locally. Upload local records to cloud. Nothing is deleted.</div>
          </button>

          <button
            className={`merge-opt ${choice === 'replace-cloud' ? 'merge-opt--on' : ''}`}
            onClick={() => setChoice('replace-cloud')}
          >
            <div className="merge-opt-title">Replace cloud with local</div>
            <div className="merge-opt-desc">Your local data becomes the source of truth. Overwrites any cloud records for your account.</div>
          </button>

          <button
            className={`merge-opt ${choice === 'replace-local' ? 'merge-opt--on' : ''}`}
            onClick={() => setChoice('replace-local')}
          >
            <div className="merge-opt-title">Replace local with cloud</div>
            <div className="merge-opt-desc">Erase all local data and download everything from your cloud account. Local data will be lost.</div>
          </button>
        </div>

        {choice === 'replace-local' && (
          <div className="merge-warning">
            <AlertTriangle size={13} />
            {localData.workouts} workouts and {localData.dailyLogs} daily logs on this device will be permanently deleted.
          </div>
        )}

        {error && <div className="merge-error">{error}</div>}

        <button
          className={`merge-confirm-btn ${choice === 'replace-local' ? 'merge-confirm-btn--destructive' : ''}`}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading
            ? <><Loader size={15} className="merge-spin" /> Working…</>
            : choice === 'replace-local'
              ? 'Delete local and sync from cloud'
              : choice === 'replace-cloud'
                ? 'Upload local data to cloud'
                : 'Merge and sync'
          }
        </button>
      </div>
    </div>
  )
}
