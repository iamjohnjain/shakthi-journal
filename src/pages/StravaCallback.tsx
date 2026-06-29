import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { exchangeStravaCode } from '../services/strava/stravaOAuth'
import { addSyncHistoryEntry } from '../db'

type State = 'loading' | 'success' | 'error'

export default function StravaCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState<State>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const code  = searchParams.get('code')
    const oauthError = searchParams.get('error')

    if (oauthError) {
      setState('error')
      setError(`Strava denied access: ${oauthError}`)
      return
    }

    if (!code) {
      setState('error')
      setError('No authorization code received from Strava.')
      return
    }

    async function exchange() {
      try {
        const token = await exchangeStravaCode(code!)
        await addSyncHistoryEntry({
          id: `strava-oauth-${Date.now()}`,
          sourceId: 'strava',
          sourceName: 'Strava',
          status: 'success',
          recordCount: 0,
          dataTypes: ['OAuth connection'],
          dataMode: 'live',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
        })
        setState('success')
        setTimeout(() => navigate('/connected-accounts'), 1800)
        void token
      } catch (e) {
        setState('error')
        setError(e instanceof Error ? e.message : 'Unknown error during token exchange')
      }
    }

    exchange()
  }, [searchParams, navigate])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: '#000',
      color: '#fff',
      fontFamily: '-apple-system, sans-serif',
    }}>
      {state === 'loading' && (
        <>
          <div style={{ fontSize: 36 }}>🏃</div>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>Connecting Strava…</p>
        </>
      )}
      {state === 'success' && (
        <>
          <div style={{ fontSize: 36 }}>✅</div>
          <p style={{ fontSize: 16, color: '#30D158' }}>Strava connected! Redirecting…</p>
        </>
      )}
      {state === 'error' && (
        <>
          <div style={{ fontSize: 36 }}>❌</div>
          <p style={{ fontSize: 16, color: '#FF453A' }}>Connection failed</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 400, textAlign: 'center' }}>{error}</p>
          <button
            onClick={() => navigate('/connected-accounts')}
            style={{
              marginTop: 8, padding: '8px 20px',
              background: '#0A84FF', color: '#fff',
              border: 'none', borderRadius: 999, cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            Back to Connected Accounts
          </button>
        </>
      )}
    </div>
  )
}
