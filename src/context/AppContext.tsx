import { createContext, useContext, useEffect, useState } from 'react'
import { getDB, getSetting, setSetting } from '../db'

interface AppContextValue {
  /** When true, dashboard shows mock/simulated data with a visible badge. */
  mockMode: boolean
  setMockMode: (v: boolean) => Promise<void>
  /** IndexedDB initialization state */
  dbStatus: 'loading' | 'ready' | 'error'
  dbError?: string
  /** App version from env */
  appVersion: string
}

const AppContext = createContext<AppContextValue>({
  mockMode: false,
  setMockMode: async () => {},
  dbStatus: 'loading',
  appVersion: '0.2.0',
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mockMode, setMockModeState] = useState(false)
  const [dbStatus, setDbStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [dbError, setDbError] = useState<string>()
  const appVersion = import.meta.env.VITE_APP_VERSION ?? '0.2.0'

  useEffect(() => {
    async function init() {
      try {
        await getDB()
        const saved = await getSetting<boolean>('mockMode', false)
        setMockModeState(saved)
        setDbStatus('ready')
      } catch (e) {
        setDbStatus('error')
        setDbError(e instanceof Error ? e.message : 'Unknown error')
      }
    }
    init()
  }, [])

  async function setMockMode(v: boolean) {
    setMockModeState(v)
    await setSetting('mockMode', v)
  }

  return (
    <AppContext.Provider value={{ mockMode, setMockMode, dbStatus, dbError, appVersion }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
