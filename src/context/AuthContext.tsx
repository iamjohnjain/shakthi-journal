import {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { syncEngine } from '../db/syncEngine'
import { clearQueueForUser } from '../db/syncQueue'
import { getSetting, setSetting, getDB } from '../db'

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
  const [workouts, nutritionEntries, dailyLogs, healthMetrics] = await Promise.all([
    db.count('workouts'),
    db.count('nutrition_entries'),
    db.count('daily_logs'),
    db.count('health_metrics'),
  ])
  return { workouts, nutritionEntries, dailyLogs, healthMetrics }
}

function hasSignificantLocalData(summary: LocalDataSummary): boolean {
  return summary.workouts > 0 || summary.nutritionEntries > 0 || summary.dailyLogs > 0
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

    // Check for existing local data that wasn't previously synced
    const savedUserId = await getSetting<string | null>('syncedUserId', null)
    const localData = await getLocalDataSummary()
    const isSameUser = savedUserId === authUser.id

    if (!isSameUser && hasSignificantLocalData(localData)) {
      // Different account (or first sign-in) — let user decide what to do
      setPendingMerge({ user: authUser, session: s, localData })
      return
    }

    // Same user returning or no local data to worry about
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
      setMode('guest')
    }

    init()

    // Listen for auth state changes (e.g. OAuth redirect returns)
    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (_event, s) => {
      if (s) {
        await activateSession(s)
      } else {
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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Session change triggers onAuthStateChange → activateSession
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not configured')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }, [])

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    if (!supabase) throw new Error('Supabase not configured')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo ?? `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }, [])

  const signInWithApple = useCallback(async (redirectTo?: string) => {
    if (!supabase) throw new Error('Supabase not configured')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: redirectTo ?? `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (user) await clearQueueForUser(user.id)
    if (supabase) await supabase.auth.signOut()
    syncEngine.setUser(null)
    await setSetting('auth.mode', 'guest')
    await setSetting('syncedUserId', null)
    setSession(null)
    setUser(null)
    setMode('guest')
  }, [user])

  const continueAsGuest = useCallback(() => {
    setSetting('auth.mode', 'guest')
    setSetting('auth.choiceMade', true)
    setMode('guest')
  }, [])

  // ── Merge resolution ────────────────────────────────────────────────────────

  const resolveMerge = useCallback(async (choice: MergeChoice) => {
    if (!pendingMerge) return
    const { session: s, user: u } = pendingMerge

    switch (choice) {
      case 'merge':
        await finalizeSignIn(s, u)
        await syncEngine.mergeFromCloud(u.id)
        break

      case 'replace-cloud':
        await finalizeSignIn(s, u)
        await syncEngine.uploadAll(u.id)
        break

      case 'replace-local':
        await finalizeSignIn(s, u)
        await syncEngine.downloadAll(u.id)
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
