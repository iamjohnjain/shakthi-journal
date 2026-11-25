import {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, assertProviderEnabled } from '../lib/supabase'
import { syncEngine } from '../db/syncEngine'
import { clearQueueForUser } from '../db/syncQueue'
import { getSetting, setSetting, getDB, setActiveDbIdentity, importGuestDataIntoAccount, clearGuestDatabase } from '../db'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthMode = 'initializing' | 'guest' | 'authenticated'

export interface AuthUser {
  id: string
  email: string | null
  displayName: string | null
  provider: string | null
}

export type MergeChoice = 'merge' | 'replace-cloud' | 'replace-local'

export interface LocalDataSummary {
  workouts: number
  nutritionEntries: number
  dailyLogs: number
  healthMetrics: number
  progressPhotos: number
  hasProfile: boolean
}

export interface PendingMerge {
  user: AuthUser
  session: Session
  localData: LocalDataSummary
}

interface AuthContextValue {
  mode: AuthMode
  user: AuthUser | null
  session: Session | null
  pendingMerge: PendingMerge | null
  isSupabaseConfigured: boolean

  signInWithEmail:    (email: string, password: string) => Promise<void>
  signUpWithEmail:    (email: string, password: string) => Promise<void>
  signInWithGoogle:   (redirectTo?: string) => Promise<void>
  signInWithApple:    (redirectTo?: string) => Promise<void>
  signOut:            () => Promise<void>
  continueAsGuest:    () => void
  resolveMerge:       (choice: MergeChoice) => Promise<void>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  mode: 'initializing',
  user: null,
  session: null,
  pendingMerge: null,
  isSupabaseConfigured: false,
  signInWithEmail:  async () => {},
  signUpWithEmail:  async () => {},
  signInWithGoogle: async () => {},
  signInWithApple:  async () => {},
  signOut:          async () => {},
  continueAsGuest:  () => {},
  resolveMerge:     async () => {},
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toAuthUser(u: User): AuthUser {
  return {
    id: u.id,
    email: u.email ?? null,
    displayName: u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
    provider: u.app_metadata?.provider ?? null,
  }
}

async function getLocalDataSummary(): Promise<LocalDataSummary> {
  const db = await getDB()
  const [workouts, nutritionEntries, dailyLogs, healthMetrics, progressPhotos, profile] = await Promise.all([
    db.count('workouts'),
    db.count('nutrition_entries'),
    db.count('daily_logs'),
    db.count('health_metrics'),
    db.count('progress_photos'),
    db.get('profile', 'main'),
  ])
  return { workouts, nutritionEntries, dailyLogs, healthMetrics, progressPhotos, hasProfile: profile != null }
}

// NOTE (Milestone 3, launch blocker — see docs/APP_STORE_READINESS.md):
// this is a best-effort, partial safety check, not real multi-account
// isolation. It now also catches health-only data, progress photos, and a
// saved profile (a real bug fixed this session: `healthMetrics` was
// already being fetched into the summary above but never actually
// checked here, so a health-only local dataset silently fell through to
// an unprompted `syncEngine.downloadAll()` in `activateSession` instead
// of the merge-choice prompt). It still does NOT guarantee isolation
// between two accounts used on the same device without ever fully
// signing out between them, and it does not partition IndexedDB by user
// at all — that is Milestone 3's actual scope. Until that lands, a
// second identity signing in on a device that still holds a prior
// identity's retained local data is NOT guaranteed safe from viewing or
// uploading that data; this check only reduces (does not eliminate) the
// risk of silently overwriting it.
/// Races `op` against a timeout so a hung IndexedDB/network call can never
/// indefinitely delay sign-out's later, guaranteed stages. Rejection
/// (timeout OR the operation's own failure) is swallowed by the caller —
/// this only bounds how long we wait, callers decide tolerance.
export function withTimeout<T>(op: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    op().then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) },
    )
  })
}

function hasSignificantLocalData(summary: LocalDataSummary): boolean {
  return (
    summary.workouts > 0 ||
    summary.nutritionEntries > 0 ||
    summary.dailyLogs > 0 ||
    summary.healthMetrics > 0 ||
    summary.progressPhotos > 0 ||
    summary.hasProfile
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mode,         setMode]         = useState<AuthMode>('initializing')
  const [user,         setUser]         = useState<AuthUser | null>(null)
  const [session,      setSession]      = useState<Session | null>(null)
  const [pendingMerge, setPendingMerge] = useState<PendingMerge | null>(null)

  // ── Session resolution ──────────────────────────────────────────────────────

  const activateSession = useCallback(async (s: Session) => {
    const authUser = toAuthUser(s.user)

    // Check for existing local data BEFORE switching databases — this has
    // to run against whichever database is currently active (guest mode's
    // unscoped database, most commonly) rather than this account's own,
    // likely-empty one. Switching first would make a real guest dataset
    // invisible to this check and silently skip the merge prompt below
    // instead of offering to carry it over.
    const savedUserId = await getSetting<string | null>('syncedUserId', null)
    const localData = await getLocalDataSummary()
    const isSameUser = savedUserId === authUser.id
    const hasLocalData = hasSignificantLocalData(localData)

    if (!isSameUser && hasLocalData) {
      // Different account (or first sign-in) with real local data already
      // present — let the user decide how to reconcile the two.
      // `resolveMerge` performs the actual database switch once they
      // choose, since the choice determines whether that local/guest data
      // gets carried into the account's own database or left behind.
      setPendingMerge({ user: authUser, session: s, localData })
      return
    }

    // Same account as before, or nothing local worth protecting — safe to
    // switch to this account's own database now.
    await setActiveDbIdentity(authUser.id)

    // First time this install has ever signed in as this user, and there's
    // nothing local to protect (a fresh install, or a reinstall under a new
    // app/bundle ID after a rebrand) — pull their existing cloud data down
    // rather than silently leaving them "signed in" to an empty app. This
    // runs BEFORE the mode flips to 'authenticated' so nothing (Layout's
    // onboarding check in particular) reads the still-empty account
    // database and sends a returning user back through onboarding.
    if (!isSameUser && !hasLocalData) {
      await withTimeout(() => syncEngine.downloadAll(authUser.id), 15000).catch(() => {})
    }
    await finalizeSignIn(s, authUser)
  }, [])

  const finalizeSignIn = useCallback(async (s: Session, authUser: AuthUser) => {
    setSession(s)
    setUser(authUser)
    setMode('authenticated')
    setPendingMerge(null)
    await setSetting('syncedUserId', authUser.id)
    await setSetting('auth.mode', 'authenticated')
    syncEngine.setUser(authUser.id)
  }, [])

  // ── Init: check persisted session ──────────────────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      void setActiveDbIdentity(null)
      setMode('guest')
      syncEngine.markLocalOnly()
      return
    }

    async function init() {
      // Existing session from Supabase
      const { data: { session: existingSession } } = await supabase!.auth.getSession()
      if (existingSession) {
        await activateSession(existingSession)
        return
      }

      // No active session → guest mode (existing local data is preserved)
      await setActiveDbIdentity(null)
      setMode('guest')
    }

    init()

    // Listen for auth state changes (e.g. OAuth redirect, token refresh)
    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (event, s) => {
      if (s) {
        await activateSession(s)
        // When the JS client auto-refreshes the token, push the new tokens to the
        // native iOS Keychain so HealthKit sync stays in sync with the web session.
        if (event === 'TOKEN_REFRESHED') {
          const w = window as unknown as Record<string, unknown>
          const bridge = (w.webkit as {
            messageHandlers?: { jeevanNative?: { postMessage: (m: unknown) => void } }
          } | undefined)
          bridge?.messageHandlers?.jeevanNative?.postMessage({
            type: 'sessionRefreshed',
            accessToken:  s.access_token,
            refreshToken: s.refresh_token,
            userId:       s.user.id,
            email:        s.user.email ?? '',
          })
        }
      } else {
        await setActiveDbIdentity(null)
        setSession(null)
        setUser(null)
        setMode('guest')
        syncEngine.setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [activateSession])

  // ── Auth actions ────────────────────────────────────────────────────────────

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not configured')
    // Trim both — autofill/paste commonly adds leading/trailing whitespace
    // that's invisible in the input but makes sign-in silently fail to
    // match what was typed at sign-up (which goes through the same trim).
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() })
    if (error) throw error
    // Session change triggers onAuthStateChange → activateSession
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not configured')
    const { error } = await supabase.auth.signUp({ email: email.trim(), password: password.trim() })
    if (error) throw error
  }, [])

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    if (!supabase) throw new Error('Supabase not configured')
    await assertProviderEnabled('google')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo ?? `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }, [])

  const signInWithApple = useCallback(async (redirectTo?: string) => {
    if (!supabase) throw new Error('Supabase not configured')
    await assertProviderEnabled('apple')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: redirectTo ?? `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    // Ordering fix (Remediation Pass 3, P2-5): the native bridge
    // notification is now sent LAST, after every local cleanup stage has
    // either completed or been bounded by a timeout — never before. The
    // previous ordering sent the native `signOut` message in the MIDDLE
    // of this function, before the settings writes and before
    // `setSession`/`setUser`/`setMode` cleared local state; since native
    // reacts to that message by tearing down the privileged WebView, a
    // slow local cleanup stage could in principle still be running (or
    // get cut off) when the WebView/JS context it needs goes away. Every
    // stage before the final native notification is also now bounded
    // (3s) so a hung IndexedDB or network call can't indefinitely delay
    // reaching that guaranteed final stage.
    if (user) {
      try {
        await withTimeout(() => clearQueueForUser(user.id), 3000)
      } catch {
        // Best-effort/bounded — a queue-clearing failure or hang must not
        // block the rest of sign-out.
      }
    }

    try {
      const client = supabase
      if (client) await withTimeout(() => client.auth.signOut(), 3000)
    } catch {
      // Best-effort/bounded — local sign-out proceeds even if the
      // Supabase request itself failed or hung (offline, server error,
      // etc.): the user's local session is ending either way, and native
      // holds its own independent copy of the auth tokens (Keychain).
    }

    syncEngine.setUser(null)

    // Switch the active database back to guest BEFORE writing the
    // auth.mode/syncedUserId settings below — otherwise those writes would
    // land in the outgoing account's own (now-closing) database instead of
    // the guest database, and the next account to sign in on this device
    // would still see this account's handle briefly reachable.
    try {
      await withTimeout(() => setActiveDbIdentity(null), 3000)
    } catch {
      // Best-effort/bounded — if this hangs, getDB()'s own safety-net
      // timeout still resolves the identity gate shortly after.
    }

    try {
      await withTimeout(() => setSetting('auth.mode', 'guest'), 2000)
    } catch {
      // Best-effort/bounded.
    }
    try {
      await withTimeout(() => setSetting('syncedUserId', null), 2000)
    } catch {
      // Best-effort/bounded.
    }

    // Local in-memory state is now fully cleared BEFORE native is told
    // anything — this is the guaranteed, final stage.
    setSession(null)
    setUser(null)
    setMode('guest')

    const w = window as unknown as Record<string, unknown>
    const bridge = (w.webkit as {
      messageHandlers?: { jeevanNative?: { postMessage: (m: unknown) => void } }
    } | undefined)
    try {
      bridge?.messageHandlers?.jeevanNative?.postMessage({ type: 'signOut' })
    } catch {
      // Best-effort — a bridge call failing (e.g. not running inside the
      // native app at all) is fine; local sign-out has already completed
      // regardless.
    }
  }, [user])

  const continueAsGuest = useCallback(() => {
    void setActiveDbIdentity(null).then(() => {
      setSetting('auth.mode', 'guest')
      setSetting('auth.choiceMade', true)
    })
    setMode('guest')
  }, [])

  // ── Merge resolution ────────────────────────────────────────────────────────

  const resolveMerge = useCallback(async (choice: MergeChoice) => {
    if (!pendingMerge) return
    const { session: s, user: u } = pendingMerge

    // Only now — once the user has actually chosen — do we switch away
    // from whichever database was active (almost always guest) to this
    // account's own. 'merge' and 'replace-cloud' both mean "keep my local
    // data," so both copy it across before anything else touches the new
    // database; 'replace-local' means "discard it," so the copy is skipped
    // and the guest database itself is left untouched (not cleared) in
    // case the user didn't mean it and wants to try again later.
    switch (choice) {
      case 'merge':
        await setActiveDbIdentity(u.id)
        await importGuestDataIntoAccount(u.id)
        await finalizeSignIn(s, u)
        await syncEngine.mergeFromCloud(u.id)
        break

      case 'replace-cloud':
        await setActiveDbIdentity(u.id)
        await importGuestDataIntoAccount(u.id)
        await finalizeSignIn(s, u)
        await syncEngine.uploadAll(u.id)
        break

      case 'replace-local':
        await setActiveDbIdentity(u.id)
        await finalizeSignIn(s, u)
        await syncEngine.downloadAll(u.id)
        // The dialog explicitly tells the user this data "will be
        // permanently deleted" — honor that. Assumes the local data being
        // discarded was guest-mode data, true for the normal sign-out-
        // before-sign-in flow this app requires; a device that still has
        // a different account's session live when this one signs in (no
        // clean sign-out in between) is a pre-existing, separately
        // documented edge case this does not additionally fix.
        await clearGuestDatabase().catch(() => {
          // Best-effort — a failure here leaves stale guest data behind
          // but must not block the sign-in that already succeeded.
        })
        break
    }
  }, [pendingMerge, finalizeSignIn])

  return (
    <AuthContext.Provider value={{
      mode, user, session, pendingMerge, isSupabaseConfigured,
      signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple,
      signOut, continueAsGuest, resolveMerge,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
