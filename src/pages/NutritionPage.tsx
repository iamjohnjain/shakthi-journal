import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, X, Pencil, UtensilsCrossed, Utensils, Check } from 'lucide-react'
import {
  addNutritionEntry, deleteNutritionEntry, updateNutritionEntry,
  getEntriesForDate, getDailyTotals, getNutritionEntryCount, QUICK_FOODS,
  getCalorieHistory, getCurrentStreak, getLoggedDatesInList, getCustomFoods,
} from '../db/nutritionStore'
import type { NutritionEntry, CustomFood } from '../db/nutritionStore'
import type { ChartPoint } from '../db/timelineStore'
import { useNutritionSettings } from '../hooks/useNutritionSettings'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import TrendChart from '../components/TrendChart'
import WheelPicker from '../components/WheelPicker'
// logStore removed — water logging retired
import './NutritionPage.css'

function todayStr() { return new Date().toISOString().split('T')[0] }

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

function weekDates(startStr: string): string[] {
  const start = new Date(startStr + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

// ─── Weekly streak bar ─────────────────────────────────────────────────────────

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function WeekStreakBar({ dates, logged, today, streak }: {
  dates: string[]
  logged: Set<string>
  today: string
  streak: number
}) {
  return (
    <div className="week-streak-bar">
      <div className="week-streak-days">
        {dates.map((d, i) => {
          const isLogged = logged.has(d)
          const isToday  = d === today
          const isFuture = d > today
          return (
            <div key={d} className="week-streak-day">
              <span className="week-streak-letter">{DAY_LETTERS[i]}</span>
              <span className={[
                'week-streak-dot',
                isLogged ? 'week-streak-dot--logged' : '',
                isToday ? 'week-streak-dot--today' : '',
                isFuture ? 'week-streak-dot--future' : '',
              ].filter(Boolean).join(' ')}>
                {isLogged && <Check size={13} strokeWidth={3} />}
              </span>
            </div>
          )
        })}
      </div>
      <div className="week-streak-divider" />
      <div className="week-streak-counter" title="Consecutive days logged">
        <Utensils size={20} className="week-streak-icon" />
        <span className="week-streak-count">{streak}</span>
      </div>
    </div>
  )
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  if (goal <= 0) return null
  const pct = Math.min(100, Math.round(value / goal * 100))
  const remaining = Math.max(0, goal - value)
  return (
    <div className="macro-bar">
      <div className="macro-bar-header">
        <span className="macro-bar-label">{label}</span>
        <span className="macro-bar-value">{Math.round(value)}<span className="macro-bar-goal">/{goal}</span></span>
      </div>
      <div className="macro-bar-track">
        <div className="macro-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="macro-bar-remaining">{remaining} remaining</div>
    </div>
  )
}

// ─── Quantity: number + unit, both scrollable and directly typeable ──────────

const WEIGHT_UNITS = ['g', 'oz']
const COUNT_UNITS  = ['scoop', 'cup', 'tbsp', 'piece', 'slice', 'serving']
const QTY_UNITS    = [...WEIGHT_UNITS, ...COUNT_UNITS]

function numberValuesFor(unit: string): number[] {
  if (unit === 'g')  return Array.from({ length: 101 }, (_, i) => i * 5)    // 0,5,…,500
  if (unit === 'oz') return Array.from({ length: 65 },  (_, i) => +(i * 0.5).toFixed(1)) // 0,0.5,…,32
  return Array.from({ length: 21 }, (_, i) => i)                           // 0..20
}

function parseQuantity(q?: string): { num: number; unit: string } {
  if (!q) return { num: 100, unit: 'g' }
  const m = q.trim().match(/^([\d.]+)\s*([a-zA-Z]+)/)
  if (m) {
    const num = parseFloat(m[1])
    const unitRaw = m[2].toLowerCase()
    const unit = QTY_UNITS.find(u => unitRaw.startsWith(u)) ?? 'g'
    return { num: isNaN(num) ? 100 : num, unit }
  }
  return { num: 1, unit: 'serving' }
}

function QuantityPicker({ num, unit, onNumChange, onUnitChange }: {
  num: number
  unit: string
  onNumChange: (n: number) => void
  onUnitChange: (u: string) => void
}) {
  const numValues = numberValuesFor(unit)
  return (
    <div className="qty-picker">
      <div className="qty-picker-col">
        <input
          className="qty-picker-input"
          type="text" inputMode="decimal"
          value={num}
          onChange={e => { const n = parseFloat(e.target.value); onNumChange(isNaN(n) ? 0 : n) }}
          onFocus={e => e.target.select()}
        />
        <WheelPicker values={numValues} value={num} onChange={v => onNumChange(+v)} />
      </div>
      <div className="qty-picker-col">
        <span className="qty-picker-unit-label">{unit}</span>
        <WheelPicker values={QTY_UNITS} value={unit} onChange={v => onUnitChange(String(v))} />
      </div>
    </div>
  )
}

// ─── Add / Edit Entry Modal ───────────────────────────────────────────────────

interface EntryModalProps {
  date: string
  mealIds: string[]
  mealLabels: string[]
  existing?: NutritionEntry
  defaultMealId?: string
  onClose: () => void
  onSaved: () => void
}

function EntryModal({ date, mealIds, mealLabels, existing, defaultMealId, onClose, onSaved }: EntryModalProps) {
  const isEdit = !!existing
  const [tab,      setTab]      = useState<'quick' | 'custom'>(isEdit ? 'custom' : 'quick')
  const [mealId,   setMealId]   = useState(existing?.mealType ?? defaultMealId ?? mealIds[0])
  const [food,     setFood]     = useState(existing?.food ?? '')
  const [calories, setCalories] = useState(existing ? String(existing.calories) : '')
  const [protein,  setProtein]  = useState(existing ? String(existing.proteinG) : '')
  const [carbs,    setCarbs]    = useState(existing?.carbsG != null ? String(existing.carbsG) : '')
  const [fat,      setFat]      = useState(existing?.fatG != null ? String(existing.fatG) : '')
  const initialQty = parseQuantity(existing?.quantity)
  const [qtyNum,   setQtyNum]   = useState(initialQty.num)
  const [qtyUnit,  setQtyUnit]  = useState(initialQty.unit)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([])

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  useEffect(() => { getCustomFoods().then(setCustomFoods) }, [])

  function fillFromQuick(q: { food: string; calories: number; proteinG: number; carbsG?: number; fatG?: number; quantity?: string }) {
    setFood(q.food); setCalories(String(q.calories))
    setProtein(String(q.proteinG)); setCarbs(q.carbsG != null ? String(q.carbsG) : '')
    setFat(q.fatG != null ? String(q.fatG) : '')
    const parsed = parseQuantity(q.quantity)
    setQtyNum(parsed.num); setQtyUnit(parsed.unit)
    setTab('custom')
  }

  async function handleSave() {
    if (!food || !calories || !protein) return
    setSaving(true)
    const data = {
      date, mealType: mealId, food,
      calories: +calories, proteinG: +protein,
      carbsG: carbs ? +carbs : undefined,
      fatG: fat ? +fat : undefined,
      quantity: qtyNum > 0 ? `${qtyNum} ${qtyUnit}` : undefined,
    }
    if (isEdit && existing) {
      await updateNutritionEntry(existing.id, data)
    } else {
      await addNutritionEntry(data)
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  const searchLower = search.trim().toLowerCase()
  const visibleCustom = customFoods.filter(f => !searchLower || f.food.toLowerCase().includes(searchLower))
  const visiblePresets = QUICK_FOODS.filter(f => !searchLower || f.food.toLowerCase().includes(searchLower))

  return (
    <div className="add-modal-overlay" onClick={onClose}>
      <div className="add-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="add-modal-header" {...swipe.handlers}>
          <div className="add-modal-grabber" />
          <h2>{isEdit ? 'Edit Food' : 'Add Food'}</h2>
          <button className="add-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="add-modal-meal-tabs">
          {mealIds.map((id, i) => (
            <button key={id} className={`meal-tab ${mealId === id ? 'active' : ''}`} onClick={() => setMealId(id)}>
              {mealLabels[i] ?? id}
            </button>
          ))}
        </div>

        {!isEdit && (
          <div className="add-modal-tabs">
            <button className={tab === 'quick' ? 'active' : ''} onClick={() => setTab('quick')}>Quick Add</button>
            <button className={tab === 'custom' ? 'active' : ''} onClick={() => setTab('custom')}>Custom</button>
          </div>
        )}

        <div className="add-modal-body">
          {tab === 'quick' ? (
            <>
              <input
                className="quick-food-search"
                type="search"
                placeholder="Search foods…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="quick-foods">
                {visibleCustom.map((q, i) => (
                  <button key={`custom-${i}`} className="quick-food-btn" onClick={() => fillFromQuick(q)}>
                    <div className="quick-food-name-row">
                      <span className="quick-food-name">{q.food}</span>
                      <span className="quick-food-made-by-you">Made By You</span>
                    </div>
                    <div className="quick-food-macros">
                      <span>{q.calories} cal</span>
                      <span>{q.proteinG}g protein</span>
                      {q.carbsG != null && <span>{q.carbsG}g carbs</span>}
                    </div>
                  </button>
                ))}
                {visiblePresets.map((q, i) => (
                  <button key={`preset-${i}`} className="quick-food-btn" onClick={() => fillFromQuick(q)}>
                    <div className="quick-food-name">{q.food}</div>
                    <div className="quick-food-macros">
                      <span>{q.calories} cal</span>
                      <span>{q.proteinG}g protein</span>
                      {q.carbsG != null && <span>{q.carbsG}g carbs</span>}
                    </div>
                  </button>
                ))}
                {visibleCustom.length === 0 && visiblePresets.length === 0 && (
                  <p className="quick-food-empty">No foods match "{search}". Try Custom to add it yourself.</p>
                )}
              </div>
            </>
          ) : (
            <div className="custom-form">
              <div className="custom-field custom-field--full">
                <label>Food</label>
                <input list="food-suggestions" value={food} placeholder="e.g. Chicken breast"
                  onChange={e => setFood(e.target.value)} />
                <datalist id="food-suggestions">
                  {QUICK_FOODS.map((q, i) => <option key={i} value={q.food} />)}
                  {customFoods.map((q, i) => <option key={i} value={q.food} />)}
                </datalist>
              </div>
              <div className="custom-fields-row">
                <div className="custom-field">
                  <label>Calories*</label>
                  <div className="field-with-unit">
                    <input autoFocus type="text" inputMode="numeric" pattern="[0-9]*" value={calories} placeholder="0"
                      onChange={e => setCalories(e.target.value.replace(/[^0-9]/g, ''))}
                      onFocus={e => { e.target.select(); setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350) }} />
                    <span>kcal</span>
                  </div>
                </div>
                <div className="custom-field">
                  <label>Carbohydrates</label>
                  <div className="field-with-unit">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={carbs} placeholder="0"
                      onChange={e => setCarbs(e.target.value.replace(/[^0-9]/g, ''))}
                      onFocus={e => { e.target.select(); setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350) }} />
                    <span>g</span>
                  </div>
                </div>
              </div>
              <div className="custom-fields-row">
                <div className="custom-field">
                  <label>Protein*</label>
                  <div className="field-with-unit">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={protein} placeholder="0"
                      onChange={e => setProtein(e.target.value.replace(/[^0-9]/g, ''))}
                      onFocus={e => { e.target.select(); setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350) }} />
                    <span>g</span>
                  </div>
                </div>
                <div className="custom-field">
                  <label>Fat</label>
                  <div className="field-with-unit">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={fat} placeholder="0"
                      onChange={e => setFat(e.target.value.replace(/[^0-9]/g, ''))}
                      onFocus={e => { e.target.select(); setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350) }} />
                    <span>g</span>
                  </div>
                </div>
              </div>
              <div className="custom-field custom-field--full">
                <label>Quantity</label>
                <QuantityPicker num={qtyNum} unit={qtyUnit} onNumChange={setQtyNum} onUnitChange={setQtyUnit} />
              </div>
            </div>
          )}
        </div>

        {tab === 'custom' && (
          <div className="add-modal-footer">
            <button className="add-modal-cancel" onClick={onClose}>Cancel</button>
            <button className="add-modal-save" disabled={saving || !food || !calories || !protein} onClick={handleSave}>
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Entry')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NutritionPage() {
  const navigate = useNavigate()
  const { mealIds, activeMealLabels, goals, loaded } = useNutritionSettings()
  const [entries,       setEntries]      = useState<NutritionEntry[]>([])
  const [totals,        setTotals]       = useState({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 })
  const [showModal,     setShowModal]    = useState(false)
  const [editEntry,     setEditEntry]    = useState<NutritionEntry | null>(null)
  const [addToMealId,   setAddToMealId]  = useState<string | undefined>()
  const [hasEverLogged, setHasEverLogged] = useState<boolean | null>(null)
  const [calorieHistory, setCalorieHistory] = useState<ChartPoint[]>([])
  const [streak,         setStreak]         = useState(0)
  const [weekLogged,     setWeekLogged]     = useState<Set<string>>(new Set())
  const date = todayStr()
  const weekStart = startOfWeek(date)
  const thisWeekDates = weekDates(weekStart)

  const load = useCallback(async () => {
    const [all, t] = await Promise.all([getEntriesForDate(date), getDailyTotals(date)])
    setEntries(all)
    setTotals(t)
  }, [date])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getNutritionEntryCount().then(c => setHasEverLogged(c > 0))
  }, [])

  const loadStreak = useCallback(async () => {
    const [hist, s, week] = await Promise.all([
      getCalorieHistory(7),
      getCurrentStreak(),
      getLoggedDatesInList(thisWeekDates),
    ])
    setCalorieHistory(hist)
    setStreak(s)
    setWeekLogged(week)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  useEffect(() => { loadStreak() }, [loadStreak])

  async function handleDelete(id: string) {
    await deleteNutritionEntry(id)
    load()
    loadStreak()
    getNutritionEntryCount().then(c => setHasEverLogged(c > 0))
  }

  function openAdd(mealId?: string) {
    setEditEntry(null)
    setAddToMealId(mealId)
    setShowModal(true)
  }

  function openEdit(e: NutritionEntry) {
    setEditEntry(e)
    setAddToMealId(e.mealType)
    setShowModal(true)
  }

  if (!loaded) return null

  const calPct  = Math.min(100, Math.round(totals.calories / goals.calories * 100))
  const protPct = Math.min(100, Math.round(totals.proteinG / goals.proteinG * 100))

  // Group entries by mealId (match on mealType)
  const grouped = Object.fromEntries(mealIds.map(id => [id, entries.filter(e => e.mealType === id)]))
  // Catch entries that don't match any current meal slot (legacy mealTypes like 'breakfast', 'lunch')
  const ungrouped = entries.filter(e => !mealIds.includes(e.mealType))

  return (
    <div className="nutrition-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Meals</h1>
          <p className="page-subtitle">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
        </div>
        <button className="log-workout-btn" onClick={() => openAdd()}>
          <Plus size={16} /> Add Food
        </button>
      </header>

      <WeekStreakBar dates={thisWeekDates} logged={weekLogged} today={date} streak={streak} />

      {/* Summary ring + macro bars */}
      <div className="nutrition-summary">
        <div className="calorie-ring-wrap">
          <svg className="calorie-ring" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-tertiary)" strokeWidth="10" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke={calPct >= 100 ? 'var(--green)' : 'var(--accent)'}
              strokeWidth="10"
              strokeDasharray={`${calPct * 2.639} 263.9`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="calorie-ring-text">
            <div className="calorie-ring-value">{Math.round(totals.calories)}</div>
            <div className="calorie-ring-label">/ {goals.calories} kcal</div>
          </div>
        </div>

        <div className="macro-bars">
          <MacroBar label="Protein"      value={totals.proteinG} goal={goals.proteinG} color="var(--accent)" />
          <MacroBar label="Carbohydrates" value={totals.carbsG}   goal={goals.carbsG}   color="var(--yellow)" />
          <MacroBar label="Fat"          value={totals.fatG}     goal={goals.fatG}     color="var(--orange)" />
        </div>
      </div>

      {/* Calorie trend — only once there's enough history to be worth a chart */}
      {calorieHistory.some(p => p.value > 0) && (
        <div className="nutrition-trend-card">
          <h2 className="nutrition-trend-title">Calories</h2>
          <TrendChart
            data={calorieHistory}
            period="7d"
            color="var(--accent)"
            unit=" cal"
            formatValue={v => Math.round(v).toLocaleString()}
            goalValue={goals.calories}
            height={110}
          />
        </div>
      )}

      {/* Smart nutrition callout — only when there's something logged */}
      {entries.length > 0 && protPct < 100 && (() => {
        const remaining = Math.max(0, goals.proteinG - Math.round(totals.proteinG))
        const suggestion = remaining <= 31
          ? `${remaining}g remaining — one chicken breast gets you there`
          : remaining <= 53
          ? `${remaining}g remaining — one chicken breast + a protein shake`
          : remaining <= 80
          ? `${remaining}g remaining — a solid meal with protein will close the gap`
          : `${remaining}g remaining — prioritise protein at every meal`
        return (
          <div className="protein-callout">
            <span>🥩 {suggestion}</span>
          </div>
        )
      })()}

      {/* First-time empty state */}
      {loaded && hasEverLogged === false && (
        <div className="nutrition-first-empty">
          <div className="nutrition-first-empty-icon">
            <UtensilsCrossed size={40} />
          </div>
          <h2 className="nutrition-first-empty-title">Start tracking your nutrition</h2>
          <p className="nutrition-first-empty-desc">
            Log meals to see your calories, protein, and macros compared to your daily goals.
            Your progress summary above will fill in as you eat.
          </p>
          <button
            className="nutrition-first-empty-cta"
            onClick={() => { setAddToMealId(undefined); setEditEntry(null); setShowModal(true) }}
          >
            Log first meal
          </button>
          <button
            className="nutrition-first-empty-secondary"
            onClick={() => navigate('/settings')}
          >
            Set nutrition goals
          </button>
        </div>
      )}

      {/* Meal groups */}
      {mealIds.map((id, i) => {
        const mealEntries = grouped[id] ?? []
        const mealLabel   = activeMealLabels[i] ?? id
        const mealCal     = mealEntries.reduce((n, e) => n + e.calories, 0)
        return (
          <section key={id} className="meal-section">
            <div className="meal-section-header">
              <h2 className="meal-section-title">{mealLabel}</h2>
              {mealCal > 0 && <span className="meal-cal-total">{mealCal} kcal</span>}
            </div>
            {mealEntries.length > 0 ? (
              <div className="meal-entries">
                {mealEntries.map(e => (
                  <div key={e.id} className="food-entry">
                    <div className="food-entry-info">
                      <span className="food-entry-name">{e.food}</span>
                      {e.quantity && <span className="food-entry-qty">{e.quantity}</span>}
                    </div>
                    <div className="food-entry-macros">
                      <span>{e.calories} cal</span>
                      <span>{e.proteinG}g P</span>
                      {e.carbsG != null && <span>{e.carbsG}g C</span>}
                      {e.fatG != null && <span>{e.fatG}g F</span>}
                    </div>
                    <div className="food-entry-actions">
                      <button className="food-entry-edit" onClick={() => openEdit(e)} title="Edit">
                        <Pencil size={12} />
                      </button>
                      <button className="food-entry-delete" onClick={() => handleDelete(e.id)} title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <button className="meal-empty" onClick={() => openAdd(id)}>
                <Plus size={13} /> Add {mealLabel}
              </button>
            )}
          </section>
        )
      })}

      {/* Catch-all for legacy/unmatched meal types (e.g. 'breakfast' under numbered mode) */}
      {ungrouped.length > 0 && (
        <section className="meal-section">
          <div className="meal-section-header">
            <h2 className="meal-section-title">Other</h2>
            <span className="meal-cal-total">{ungrouped.reduce((n, e) => n + e.calories, 0)} kcal</span>
          </div>
          <div className="meal-entries">
            {ungrouped.map(e => (
              <div key={e.id} className="food-entry">
                <div className="food-entry-info">
                  <span className="food-entry-name">{e.food}</span>
                  {e.quantity && <span className="food-entry-qty">{e.quantity}</span>}
                  <span className="food-entry-qty" style={{ fontStyle: 'italic' }}>{e.mealType}</span>
                </div>
                <div className="food-entry-macros">
                  <span>{e.calories} cal</span>
                  <span>{e.proteinG}g P</span>
                </div>
                <div className="food-entry-actions">
                  <button className="food-entry-edit" onClick={() => openEdit(e)}><Pencil size={12} /></button>
                  <button className="food-entry-delete" onClick={() => handleDelete(e.id)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showModal && (
        <EntryModal
          date={date}
          mealIds={mealIds}
          mealLabels={activeMealLabels}
          existing={editEntry ?? undefined}
          defaultMealId={addToMealId}
          onClose={() => { setShowModal(false); setEditEntry(null) }}
          onSaved={() => { load(); loadStreak(); setHasEverLogged(true) }} />
      )}
    </div>
  )
}
