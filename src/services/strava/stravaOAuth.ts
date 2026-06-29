// Strava OAuth 2.0 — client-side only (dev/personal use)
//
// SECURITY NOTE: VITE_ environment variables are embedded in the JS bundle at
// build time. For personal local use this is acceptable. For a public-facing
// production app you must proxy the token exchange through a backend endpoint
// so the client_secret is never in the browser.

const CLIENT_ID     = import.meta.env.VITE_STRAVA_CLIENT_ID     as string | undefined
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET as string | undefined
const REDIRECT_URI  = import.meta.env.VITE_STRAVA_REDIRECT_URI  as string
  ?? 'http://localhost:5173/oauth/strava/callback'

const TOKEN_STORAGE_KEY = 'strava_token'

export interface StravaToken {
  access_token: string
  refresh_token: string
  expires_at: number  // unix timestamp
  athlete: {
    id: number
    firstname: string
    lastname: string
    profile: string  // avatar URL
  }
}

// ─── Credential check ─────────────────────────────────────────────────────────

export function stravaCredentialsConfigured(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET
}

// ─── Step 1: redirect user to Strava authorization ───────────────────────────

export function redirectToStravaAuth(): void {
  if (!CLIENT_ID) {
    throw new Error('VITE_STRAVA_CLIENT_ID is not set. Copy .env.example to .env and add your Strava app credentials.')
  }

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all,profile:read_all',
  })

  window.location.href = `https://www.strava.com/oauth/authorize?${params}`
}

// ─── Step 2: exchange authorization code for token ───────────────────────────

export async function exchangeStravaCode(code: string): Promise<StravaToken> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Strava credentials not configured.')
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Strava token exchange failed: ${err.message ?? res.statusText}`)
  }

  const token: StravaToken = await res.json()
  saveStravaToken(token)
  return token
}

// ─── Token storage ────────────────────────────────────────────────────────────

export function saveStravaToken(token: StravaToken): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token))
}

export function loadStravaToken(): StravaToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearStravaToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function stravaTokenExpired(token: StravaToken): boolean {
  return Date.now() / 1000 >= token.expires_at - 60
}

// ─── Step 3: refresh expired token ───────────────────────────────────────────

export async function refreshStravaToken(token: StravaToken): Promise<StravaToken> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Strava credentials not configured.')

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) throw new Error('Strava token refresh failed.')

  const refreshed: StravaToken = await res.json()
  saveStravaToken(refreshed)
  return refreshed
}

// ─── Get valid token (auto-refreshes if expired) ─────────────────────────────

export async function getValidStravaToken(): Promise<StravaToken | null> {
  let token = loadStravaToken()
  if (!token) return null
  if (stravaTokenExpired(token)) {
    token = await refreshStravaToken(token)
  }
  return token
}

export function stravaConnectedAccount(): { name: string; avatar: string } | null {
  const token = loadStravaToken()
  if (!token) return null
  return {
    name: `${token.athlete.firstname} ${token.athlete.lastname}`,
    avatar: token.athlete.profile,
  }
}
