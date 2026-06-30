import { useState, useEffect } from 'react'
import { getSetting, setSetting } from '../db'
import { syncEngine } from '../db/syncEngine'

function syncSetting(key: string, value: unknown): void {
  void syncEngine.queueWrite('settings', 'upsert', key, { key, value, updatedAt: new Date().toISOString() })
}

export interface CardConfig {
  id: string
  label: string
  group: string
  description: string
  defaultVisible: boolean
}

export const CARD_REGISTRY: CardConfig[] = [
  { id: 'goal-ring',     label: 'Main Goal Ring',       group: 'Overview',  description: 'Animated progress ring toward your primary goal',         defaultVisible: true  },
  { id: 'quick-actions', label: 'Quick Actions',        group: 'Overview',  description: 'Log Food, Log Workout, Import, Compare buttons',          defaultVisible: true  },
  { id: 'body',          label: 'Body Composition',     group: 'Health',    description: 'Weight, body fat %, muscle mass cards',                   defaultVisible: true  },
  { id: 'activity',      label: 'Activity & Steps',     group: 'Health',    description: 'Daily steps and active calorie progress',                 defaultVisible: true  },
  { id: 'nutrition',     label: 'Nutrition',            group: 'Health',    description: 'Protein, calories, and macro cards',                      defaultVisible: true  },
  { id: 'vitals',        label: 'Vitals',               group: 'Health',    description: 'HRV and resting heart rate cards',                        defaultVisible: true  },
  { id: 'coach-notes',   label: 'Coach Notes',          group: 'Insights',  description: 'Rule-based daily recommendations (no AI)',                defaultVisible: true  },
  { id: 'import-status', label: 'Import Status Banner', group: 'Data',      description: 'Shows when data was last imported',                       defaultVisible: true  },
]

// Sections that appear in the reorderable area below the fixed header
export const REORDERABLE_IDS = ['body', 'activity', 'nutrition', 'vitals']
const DEFAULT_ORDER = REORDERABLE_IDS

const VISIBILITY_KEY = 'dashboard-cards'
const ORDER_KEY      = 'dashboard-cards-order'

function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function useDashboardCards() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [order, setOrder]           = useState<string[]>(DEFAULT_ORDER)
  const [loaded, setLoaded]         = useState(false)

  useEffect(() => {
    Promise.all([
      getSetting<Record<string, boolean>>(VISIBILITY_KEY, {}),
      getSetting<string[]>(ORDER_KEY, DEFAULT_ORDER),
    ]).then(([vis, ord]) => {
      setVisibility(vis)
      // Merge: ensure any new IDs in DEFAULT_ORDER are appended
      const merged = [
        ...ord.filter(id => DEFAULT_ORDER.includes(id)),
        ...DEFAULT_ORDER.filter(id => !ord.includes(id)),
      ]
      setOrder(merged)
      setLoaded(true)
    })
  }, [])

  function isVisible(id: string): boolean {
    if (!loaded) return true
    const reg = CARD_REGISTRY.find(c => c.id === id)
    return visibility[id] ?? reg?.defaultVisible ?? true
  }

  async function toggle(id: string) {
    const next = { ...visibility, [id]: !isVisible(id) }
    setVisibility(next)
    await setSetting(VISIBILITY_KEY, next)
    syncSetting(VISIBILITY_KEY, next)
  }

  async function hide(id: string) {
    const next = { ...visibility, [id]: false }
    setVisibility(next)
    await setSetting(VISIBILITY_KEY, next)
    syncSetting(VISIBILITY_KEY, next)
  }

  async function show(id: string) {
    const next = { ...visibility, [id]: true }
    setVisibility(next)
    await setSetting(VISIBILITY_KEY, next)
    syncSetting(VISIBILITY_KEY, next)
  }

  async function moveUp(id: string) {
    const idx = order.indexOf(id)
    if (idx <= 0) return
    const next = moveInArray(order, idx, idx - 1)
    setOrder(next)
    await setSetting(ORDER_KEY, next)
    syncSetting(ORDER_KEY, next)
  }

  async function moveDown(id: string) {
    const idx = order.indexOf(id)
    if (idx < 0 || idx >= order.length - 1) return
    const next = moveInArray(order, idx, idx + 1)
    setOrder(next)
    await setSetting(ORDER_KEY, next)
    syncSetting(ORDER_KEY, next)
  }

  async function pinToTop(id: string) {
    const idx = order.indexOf(id)
    if (idx <= 0) return
    const next = moveInArray(order, idx, 0)
    setOrder(next)
    await setSetting(ORDER_KEY, next)
    syncSetting(ORDER_KEY, next)
  }

  async function setAll(visible: boolean) {
    const next: Record<string, boolean> = {}
    CARD_REGISTRY.forEach(c => { next[c.id] = visible })
    setVisibility(next)
    await setSetting(VISIBILITY_KEY, next)
    syncSetting(VISIBILITY_KEY, next)
  }

  async function resetToDefaults() {
    setVisibility({})
    setOrder(DEFAULT_ORDER)
    await Promise.all([
      setSetting(VISIBILITY_KEY, {}),
      setSetting(ORDER_KEY, DEFAULT_ORDER),
    ])
    syncSetting(VISIBILITY_KEY, {})
    syncSetting(ORDER_KEY, DEFAULT_ORDER)
  }

  async function setMinimal() {
    const minimalVisible = new Set(['goal-ring', 'quick-actions', 'nutrition'])
    const next: Record<string, boolean> = {}
    CARD_REGISTRY.forEach(c => { next[c.id] = minimalVisible.has(c.id) })
    setVisibility(next)
    await setSetting(VISIBILITY_KEY, next)
    syncSetting(VISIBILITY_KEY, next)
  }

  return {
    isVisible, toggle, hide, show,
    moveUp, moveDown, pinToTop,
    setAll, resetToDefaults, setMinimal,
    cards: CARD_REGISTRY,
    sectionOrder: order,
    loaded,
  }
}
