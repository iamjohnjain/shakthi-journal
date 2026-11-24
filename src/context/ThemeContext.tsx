import { createContext, useContext, useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db'

export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  /** What's actually rendering right now — if the user hasn't made an
      explicit choice, this tracks the OS/browser's own preference live. */
  theme: ResolvedTheme
  /** False until the user has explicitly picked Light or Dark in Settings
      — while false, `theme` is just a live read of the system preference,
      not a stored choice. */
  isExplicit: boolean
  /** Persists an explicit choice and applies it immediately — overrides
      the OS/browser preference from here on, until cleared. */
  setTheme: (t: ResolvedTheme) => void
  /** Drops back to following the OS/browser preference automatically. */
  clearTheme: () => void
}

const SETTING_KEY = 'app.theme'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyAttribute(explicit: ResolvedTheme | null) {
  if (explicit) document.documentElement.setAttribute('data-theme', explicit)
  else document.documentElement.removeAttribute('data-theme')
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isExplicit: false,
  setTheme: () => {},
  clearTheme: () => {},
})

/** Jeevan was dark-only until now. Default behavior (no explicit choice
    ever made) is to just follow whatever the user's device/browser already
    prefers — someone with iOS set to Dark Mode sees Jeevan in dark, same
    as any other app, with zero setup. Settings → Appearance lets them
    override that with one tap, which then sticks regardless of what the
    OS does afterward, until they clear it. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [explicitTheme, setExplicitTheme] = useState<ResolvedTheme | null>(null)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => systemPrefersDark() ? 'dark' : 'light')

  useEffect(() => {
    getSetting<ResolvedTheme | null>(SETTING_KEY, null).then(saved => {
      setExplicitTheme(saved)
      applyAttribute(saved)
    })
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange(e: MediaQueryListEvent) { setSystemTheme(e.matches ? 'dark' : 'light') }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function setTheme(t: ResolvedTheme) {
    setExplicitTheme(t)
    applyAttribute(t)
    void setSetting(SETTING_KEY, t)
  }

  function clearTheme() {
    setExplicitTheme(null)
    applyAttribute(null)
    void setSetting(SETTING_KEY, null)
  }

  const theme = explicitTheme ?? systemTheme

  return (
    <ThemeContext.Provider value={{ theme, isExplicit: explicitTheme != null, setTheme, clearTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
