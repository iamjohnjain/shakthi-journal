import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, X, Pencil, UtensilsCrossed } from 'lucide-react'
import {
  addNutritionEntry, deleteNutritionEntry, updateNutritionEntry,
  getEntriesForDate, getDailyTotals, getNutritionEntryCount, QUICK_FOODS,
} from '../db/nutritionStore'
import type { NutritionEntry } from '../db/nutritionStore'
import { useNutritionSettings } from '../hooks/useNutritionSettings'
// logStore removed — water logging retired
import './NutritionPage.css'

function todayStr() { return new Date().toISOString().split('T')[0] }

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
  const [qty,      setQty]      = useState(existing?.quantity ?? '')
  const [saving,   setSaving]   = useState(false)

  function fillFromQuick(q: typeof QUICK_FOODS[number]) {
    setFood(q.food); setCalories(String(q.calories))
    setProtein(String(q.proteinG)); setCarbs(String(q.carbsG ?? ''))
    setFat(String(q.fatG ?? '')); setQty(q.quantity ?? '')
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
      quantity: qty || undefined,
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

  return (
    <div className="add-modal-overlay" onClick={onClose}>
      <div className="add-modal" onClick={e => e.stopPropagation()}>
        <div className="add-modal-header">
          <h2>{isEdit ? 'Edit Food' : 'Add Food'}</h2>
          <button className="add-modal-close" onClick={onClose}><X size={18} /></button>
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
            <div className="quick-foods">
              {QUICK_FOODS.map((q, i) => (
                <button key={i} className="quick-food-btn" onClick={() => fillFromQuick(q)}>
                  <div className="quick-food-name">{q.food}</div>
                  <div className="quick-food-macros">
                    <span>{q.calories} cal</span>
                    <span>{q.proteinG}g protein</span>
                    {q.quantity && <span>{q.quantity}</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="custom-form">
              <div className="custom-field custom-field--full">
                <label>Food</label>
                <input list="food-suggestions" value={food} placeholder="e.g. Chicken breast"
                  onChange={e => setFood(e.target.value)} />
                <datalist id="food-suggestions">
                  {QUICK_FOODS.map((q, i) => <option key={i} value={q.food} />)}
                </datalist>
              </div>
              <div className="custom-fields-row">
                <div className="custom-field">
                  <label>Calories*</label>
                  <div className="field-with-unit">
                    <input type="number" min={0} value={calories} placeholder="0" onChange={e => setCalories(e.target.value)} />
                    <span>kcal</span>
                  </div>
                </div>
                <div className="custom-field">
                  <label>Protein*</label>
                  <div className="field-with-unit">
                    <input type="number" min={0} value={protein} placeholder="0" onChange={e => setProtein(e.target.value)} />
                    <span>g</span>
                  </div>
                </div>
              </div>
              <div className="custom-fields-row">
                <div className="custom-field">
                  <label>Carbs</label>
                  <div className="field-with-unit">
                    <input type="number" min={0} value={carbs} placeholder="0" onChange={e => setCarbs(e.target.value)} />
                    <span>g</span>
                  </div>
                </div>
                <div className="custom-field">
                  <label>Fat</label>
                  <div className="field-with-unit">
                    <input type="number" min={0} value={fat} placeholder="0" onChange={e => setFat(e.target.value)} />
                    <span>g</span>
                  </div>
                </div>
              </div>
              <div className="custom-field custom-field--full">
                <label>Quantity</label>
                <input type="text" value={qty} placeholder="e.g. 1 cup, 6 oz" onChange={e => setQty(e.target.value)} />
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
  const date = todayStr()

  const load = useCallback(async () => {
    const [all, t] = await Promise.all([getEntriesForDate(date), getDailyTotals(date)])
    setEntries(all)
    setTotals(t)
  }, [date])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getNutritionEntryCount().then(c => setHasEverLogged(c > 0))
  }, [])

  async function handleDelete(id: string) {
    await deleteNutritionEntry(id)
    load()
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
          <h1 className="page-title">Nutrition</h1>
          <p className="page-subtitle">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
        </div>
        <button className="log-workout-btn" onClick={() => openAdd()}>
          <Plus size={16} /> Add Food
        </button>
      </header>

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
          <MacroBar label="Protein" value={totals.proteinG} goal={goals.proteinG} color="var(--accent)" />
          <MacroBar label="Carbs"   value={totals.carbsG}   goal={goals.carbsG}   color="var(--yellow)" />
          <MacroBar label="Fat"     value={totals.fatG}     goal={goals.fatG}     color="var(--orange)" />
        </div>
      </div>

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
          onSaved={() => { load(); setHasEverLogged(true) }} />
      )}
    </div>
  )
}
