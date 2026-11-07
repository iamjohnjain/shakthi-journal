import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Trash2, X, Pencil, UtensilsCrossed, Utensils, Check, ChevronLeft, ChevronRight,
  Sparkles, Mic, Loader2, Camera, Zap,
} from 'lucide-react'
import {
  parseMealDescription, refineMealDescription, analyzeMealPhoto, refineMealPhoto, isAiMealParsingAvailable,
} from '../lib/aiMealParser'
import type { ParsedMealItem, Clarification, MealParseResult } from '../lib/aiMealParser'
import { decodeBarcodeFromImage, lookupBarcode } from '../lib/barcodeScan'
import { compressImageToDataUrl } from '../lib/imageUtils'
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

function offsetDateStr(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

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

function WeekStreakBar({ dates, logged, today, streak, viewDate, onSelectDate }: {
  dates: string[]
  logged: Set<string>
  today: string
  streak: number
  viewDate: string
  onSelectDate: (d: string) => void
}) {
  return (
    <div className="week-streak-bar">
      <div className="week-streak-days">
        {dates.map((d, i) => {
          const isLogged = logged.has(d)
          const isToday  = d === today
          const isFuture = d > today
          const isViewed = d === viewDate
          return (
            <button key={d} className="week-streak-day" onClick={() => onSelectDate(d)} aria-label={d}>
              <span className="week-streak-letter">{DAY_LETTERS[i]}</span>
              <span className={[
                'week-streak-dot',
                isLogged ? 'week-streak-dot--logged' : '',
                isToday ? 'week-streak-dot--today' : '',
                isFuture ? 'week-streak-dot--future' : '',
                isViewed ? 'week-streak-dot--viewed' : '',
              ].filter(Boolean).join(' ')}>
                {isLogged && <Check size={13} strokeWidth={3} />}
              </span>
            </button>
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
const COUNT_UNITS  = ['scoop', 'cup', 'tbsp', 'piece', 'slice', 'serving', 'bottle', 'can']
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

// ─── AI meal logging — shared pieces (describe / photo / quick log) ───────────

// Minimal shape for the Web Speech API — not in TS's DOM lib, and only some
// browsers implement it (notably: not reliably in WKWebView, where the OS
// keyboard's own dictation button already covers voice input for any text
// field, so this is a nice-to-have on top of that, not the only way in).
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null ?? null
}

interface AiDraftItem extends ParsedMealItem {
  _key: string
  source?: 'barcode'
}

const CONFIDENCE_LABEL: Record<ParsedMealItem['confidence'], string> = {
  high: 'Estimated',
  medium: 'Rough estimate',
  low: 'Low-confidence guess',
}

function draftItemsFrom(items: ParsedMealItem[]): AiDraftItem[] {
  return items.map((p, i) => ({ ...p, _key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}` }))
}

function numField(value: number, onChange: (n: number) => void) {
  return (
    <input type="text" inputMode="numeric" pattern="[0-9]*" value={value}
      onChange={e => onChange(+e.target.value.replace(/[^0-9]/g, '') || 0)}
      onFocus={e => e.target.select()} />
  )
}

/** The editable best-guess item cards — shared by Describe and Photo tabs. */
function MealReviewList({ items, onUpdate, onRemove }: {
  items: AiDraftItem[]
  onUpdate: (key: string, patch: Partial<AiDraftItem>) => void
  onRemove: (key: string) => void
}) {
  return (
    <div className="ai-review-list">
      {items.map(it => (
        <div key={it._key} className="ai-review-card">
          <div className="ai-review-card-top">
            <input className="ai-review-food-input" value={it.food}
              onChange={e => onUpdate(it._key, { food: e.target.value })} />
            <button className="ai-review-remove" onClick={() => onRemove(it._key)} aria-label="Remove item">
              <X size={14} />
            </button>
          </div>
          <span className={`ai-confidence ${it.source === 'barcode' ? 'ai-confidence--barcode' : `ai-confidence--${it.confidence}`}`}>
            {it.source === 'barcode' ? 'Scanned from barcode' : CONFIDENCE_LABEL[it.confidence]}
          </span>

          <div className="custom-field custom-field--full">
            <label>Quantity</label>
            <QuantityPicker num={it.qtyNum} unit={it.qtyUnit}
              onNumChange={n => onUpdate(it._key, { qtyNum: n })}
              onUnitChange={u => onUpdate(it._key, { qtyUnit: u })} />
          </div>

          <div className="custom-fields-row">
            <div className="custom-field">
              <label>Calories</label>
              <div className="field-with-unit">
                {numField(it.calories, n => onUpdate(it._key, { calories: n }))}
                <span>kcal</span>
              </div>
            </div>
            <div className="custom-field">
              <label>Protein</label>
              <div className="field-with-unit">
                {numField(it.proteinG, n => onUpdate(it._key, { proteinG: n }))}
                <span>g</span>
              </div>
            </div>
          </div>
          <div className="custom-fields-row">
            <div className="custom-field">
              <label>Carbs</label>
              <div className="field-with-unit">
                {numField(it.carbsG, n => onUpdate(it._key, { carbsG: n }))}
                <span>g</span>
              </div>
            </div>
            <div className="custom-field">
              <label>Fat</label>
              <div className="field-with-unit">
                {numField(it.fatG, n => onUpdate(it._key, { fatG: n }))}
                <span>g</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The non-blocking follow-up question — tappable options plus a free-text/
    voice answer, shown alongside whatever best-guess items already exist.
    Never a dead end: the user can always just log the best guess as-is
    instead of answering. */
function ClarificationBlock({ clarification, onAnswer, busy }: {
  clarification: Clarification
  onAnswer: (answer: string) => void
  busy: boolean
}) {
  const [custom, setCustom] = useState('')
  const speechCtor = getSpeechRecognitionCtor()
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  function toggleListening() {
    if (listening) { recognitionRef.current?.stop(); return }
    if (!speechCtor) return
    const rec = new speechCtor()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = e => {
      const t = e.results[0]?.[0]?.transcript
      if (t) setCustom(c => (c ? `${c} ${t}` : t))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  return (
    <div className="ai-clarify">
      <p className="ai-clarify-q">{clarification.question}</p>
      {clarification.options.length > 0 && (
        <div className="ai-clarify-options">
          {clarification.options.map(opt => (
            <button key={opt} className="ai-clarify-chip" onClick={() => onAnswer(opt)} disabled={busy}>{opt}</button>
          ))}
        </div>
      )}
      <div className="ai-clarify-custom">
        <input
          placeholder="Or type your own…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) onAnswer(custom.trim()) }}
          disabled={busy}
        />
        {speechCtor && (
          <button type="button" className={`ai-clarify-mic ${listening ? 'ai-mic-btn--active' : ''}`}
            onClick={toggleListening} aria-label={listening ? 'Stop dictating' : 'Dictate'} disabled={busy}>
            <Mic size={14} />
          </button>
        )}
        <button className="ai-clarify-send" onClick={() => custom.trim() && onAnswer(custom.trim())}
          disabled={!custom.trim() || busy} aria-label="Send answer">
          <Check size={14} />
        </button>
      </div>
    </div>
  )
}

/** A soft, non-alarming note for the rare total-failure case — paired with
    a direct shortcut into manual entry rather than a dead-end error. */
function SoftNote({ note, onManual }: { note: string; onManual: () => void }) {
  return (
    <div className="ai-note">
      <p>{note}</p>
      <button className="ai-describe-back" onClick={onManual}>Add it manually instead</button>
    </div>
  )
}

// ─── Describe tab (free text / voice) ──────────────────────────────────────────

function AiMealTab({ onLogged, onFallbackToManual }: {
  onLogged: (items: { food: string; calories: number; proteinG: number; carbsG: number; fatG: number; quantity: string }[]) => void
  onFallbackToManual: () => void
}) {
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'input' | 'loading'>('input')
  const [items, setItems] = useState<AiDraftItem[]>([])
  const [clarification, setClarification] = useState<Clarification | null>(null)
  const [note, setNote] = useState('')
  const [answering, setAnswering] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechCtor = getSpeechRecognitionCtor()

  function toggleListening() {
    if (listening) { recognitionRef.current?.stop(); return }
    if (!speechCtor) return
    const rec = new speechCtor()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = e => {
      const t = e.results[0]?.[0]?.transcript
      if (t) setDescription(d => (d ? `${d} ${t}` : t))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  function applyResult(result: MealParseResult) {
    setItems(prev => (result.items.length > 0 ? draftItemsFrom(result.items) : prev))
    setClarification(result.clarification ?? null)
    setNote(result.items.length === 0 && !result.clarification ? (result.note ?? '') : '')
  }

  async function handleEstimate() {
    if (!description.trim()) return
    setStatus('loading')
    const result = await parseMealDescription(description)
    applyResult(result)
    setStatus('input') // falls through to the items/clarification/note render below once items/clarification/note are set
  }

  async function handleAnswer(answer: string) {
    if (!clarification) return
    setAnswering(true)
    const result = await refineMealDescription(description, clarification.question, answer)
    applyResult(result)
    setAnswering(false)
  }

  function updateItem(key: string, patch: Partial<AiDraftItem>) {
    setItems(prev => prev.map(it => (it._key === key ? { ...it, ...patch } : it)))
  }
  function removeItem(key: string) {
    setItems(prev => prev.filter(it => it._key !== key))
  }
  function reset() {
    setStatus('input'); setItems([]); setClarification(null); setNote(''); setDescription('')
  }

  const hasResult = items.length > 0 || clarification !== null || note !== ''

  if (!hasResult) {
    return (
      <div className="ai-describe">
        <p className="ai-describe-hint">
          Describe what you ate, in your own words — it'll split into separate items and estimate nutrition for each.
        </p>
        <div className="ai-describe-input-wrap">
          <textarea
            className="ai-describe-textarea"
            placeholder={`e.g. "4 slices of Costco pizza, a bottle of coke, and I drizzled 10g of olive oil on top"`}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            disabled={status === 'loading'}
          />
          {speechCtor && (
            <button type="button" className={`ai-mic-btn ${listening ? 'ai-mic-btn--active' : ''}`}
              onClick={toggleListening} aria-label={listening ? 'Stop dictating' : 'Dictate'}>
              <Mic size={16} />
            </button>
          )}
        </div>
        <button className="ai-estimate-btn" onClick={handleEstimate} disabled={!description.trim() || status === 'loading'}>
          {status === 'loading'
            ? <><Loader2 size={15} className="ai-spin" /> Estimating…</>
            : <><Sparkles size={15} /> Estimate Nutrition</>}
        </button>
      </div>
    )
  }

  if (items.length === 0 && note) {
    return (
      <div className="ai-describe">
        <SoftNote note={note} onManual={onFallbackToManual} />
        <button className="ai-describe-back" onClick={reset}>Try again</button>
      </div>
    )
  }

  return (
    <div className="ai-describe">
      <p className="ai-describe-hint">Estimated — review and adjust before logging.</p>
      {clarification && <ClarificationBlock clarification={clarification} onAnswer={handleAnswer} busy={answering} />}
      {items.length === 0 ? (
        <p className="ai-review-empty">Everything was removed. <button className="ai-describe-back" onClick={reset}>Start over</button></p>
      ) : (
        <>
          <MealReviewList items={items} onUpdate={updateItem} onRemove={removeItem} />
          <div className="ai-review-actions">
            <button className="ai-describe-back" onClick={reset}>Start over</button>
            <button className="add-modal-save" onClick={() => onLogged(items.map(it => ({
              food: it.food, calories: it.calories, proteinG: it.proteinG, carbsG: it.carbsG, fatG: it.fatG,
              quantity: `${it.qtyNum} ${it.qtyUnit}`,
            })))}>
              <Check size={15} /> Log {items.length} {items.length === 1 ? 'Item' : 'Items'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Photo tab (food photo / receipt / barcode, all through one button) ───────

function PhotoMealTab({ onLogged, onFallbackToManual, autoOpen }: {
  onLogged: (items: { food: string; calories: number; proteinG: number; carbsG: number; fatG: number; quantity: string }[]) => void
  onFallbackToManual: () => void
  autoOpen?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'scanning' | 'analyzing'>('idle')
  const [items, setItems] = useState<AiDraftItem[]>([])
  const [clarification, setClarification] = useState<Clarification | null>(null)
  const [note, setNote] = useState('')
  const [answering, setAnswering] = useState(false)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const autoOpened = useRef(false)

  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true
      fileRef.current?.click()
    }
  }, [autoOpen])

  function openCamera() { fileRef.current?.click() }

  function applyResult(result: MealParseResult) {
    setItems(prev => (result.items.length > 0 ? draftItemsFrom(result.items) : prev))
    setClarification(result.clarification ?? null)
    setNote(result.items.length === 0 && !result.clarification ? (result.note ?? '') : '')
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
    setStatus('scanning')

    // 1. Try a local barcode/QR decode first — instant, free, no AI call needed.
    const barcode = await decodeBarcodeFromImage(file)
    if (barcode) {
      const product = await lookupBarcode(barcode)
      if (product) {
        setItems([{
          _key: `${Date.now()}`,
          source: 'barcode',
          food: product.food,
          qtyNum: product.qtyNum, qtyUnit: product.qtyUnit,
          calories: product.calories, proteinG: product.proteinG, carbsG: product.carbsG, fatG: product.fatG,
          confidence: 'high',
        }])
        setStatus('idle')
        return
      }
      // Decoded a barcode but it's not in Open Food Facts — fall through to
      // vision AI, which might still recognize the product from the photo.
    }

    // 2. Vision AI — compress first to keep the payload small and the round-trip fast.
    setStatus('analyzing')
    try {
      const dataUrl = await compressImageToDataUrl(file)
      setImageDataUrl(dataUrl)
      const result = await analyzeMealPhoto(dataUrl)
      applyResult(result)
    } catch {
      setNote("Couldn't read that photo — add it yourself below.")
    }
    setStatus('idle')
  }

  async function handleAnswer(answer: string) {
    if (!clarification || !imageDataUrl) return
    setAnswering(true)
    const result = await refineMealPhoto(imageDataUrl, clarification.question, answer)
    applyResult(result)
    setAnswering(false)
  }

  function updateItem(key: string, patch: Partial<AiDraftItem>) {
    setItems(prev => prev.map(it => (it._key === key ? { ...it, ...patch } : it)))
  }
  function removeItem(key: string) {
    setItems(prev => prev.filter(it => it._key !== key))
  }
  function reset() {
    setStatus('idle'); setItems([]); setClarification(null); setNote('')
    setImageDataUrl(null)
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
  }

  const hasResult = items.length > 0 || clarification !== null || note !== ''
  const busy = status === 'scanning' || status === 'analyzing'

  const fileInput = (
    <input ref={fileRef} type="file" accept="image/*" capture="environment"
      onChange={handleFile} style={{ display: 'none' }} />
  )

  if (!hasResult) {
    return (
      <div className="ai-describe">
        {fileInput}
        {previewUrl && <img src={previewUrl} alt="" className="ai-photo-preview" />}
        <p className="ai-describe-hint">
          Snap a photo of your food, a receipt, or a barcode — it figures out which and estimates nutrition.
        </p>
        <button className="ai-estimate-btn ai-photo-btn" onClick={openCamera} disabled={busy}>
          {busy
            ? <><Loader2 size={15} className="ai-spin" /> {status === 'scanning' ? 'Checking for a barcode…' : 'Analyzing photo…'}</>
            : <><Camera size={16} /> Take a Photo</>}
        </button>
      </div>
    )
  }

  if (items.length === 0 && note) {
    return (
      <div className="ai-describe">
        {fileInput}
        <SoftNote note={note} onManual={onFallbackToManual} />
        <button className="ai-describe-back" onClick={reset}>Try another photo</button>
      </div>
    )
  }

  return (
    <div className="ai-describe">
      {fileInput}
      <p className="ai-describe-hint">Estimated from your photo — review and adjust before logging.</p>
      {clarification && <ClarificationBlock clarification={clarification} onAnswer={handleAnswer} busy={answering} />}
      {items.length === 0 ? (
        <p className="ai-review-empty">Everything was removed. <button className="ai-describe-back" onClick={reset}>Start over</button></p>
      ) : (
        <>
          <MealReviewList items={items} onUpdate={updateItem} onRemove={removeItem} />
          <div className="ai-review-actions">
            <button className="ai-describe-back" onClick={reset}>Retake</button>
            <button className="add-modal-save" onClick={() => onLogged(items.map(it => ({
              food: it.food, calories: it.calories, proteinG: it.proteinG, carbsG: it.carbsG, fatG: it.fatG,
              quantity: `${it.qtyNum} ${it.qtyUnit}`,
            })))}>
              <Check size={15} /> Log {items.length} {items.length === 1 ? 'Item' : 'Items'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Quick Log tab (manual numbers, no name required) ──────────────────────────

function QuickLogTab({ onLogged }: {
  onLogged: (item: { food: string; calories: number; proteinG: number; carbsG: number; fatG: number; quantity: string }) => void
}) {
  const [food,     setFood]     = useState('')
  const [calories, setCalories] = useState('')
  const [protein,  setProtein]  = useState('')
  const [carbs,    setCarbs]    = useState('')
  const [fat,      setFat]      = useState('')

  function handleLog() {
    if (!calories) return
    onLogged({
      food: food.trim() || `Quick entry — ${calories} cal`,
      calories: +calories, proteinG: +protein || 0, carbsG: +carbs || 0, fatG: +fat || 0,
      quantity: '1 serving',
    })
  }

  return (
    <div className="custom-form">
      <p className="ai-describe-hint">Just the numbers — no need to name it unless you want to.</p>
      <div className="custom-field custom-field--full">
        <label>Name (optional)</label>
        <input value={food} onChange={e => setFood(e.target.value)} placeholder="e.g. Leftovers" />
      </div>
      <div className="custom-fields-row">
        <div className="custom-field">
          <label>Calories*</label>
          <div className="field-with-unit">
            <input autoFocus type="text" inputMode="numeric" pattern="[0-9]*" value={calories} placeholder="0"
              onChange={e => setCalories(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={e => e.target.select()} />
            <span>kcal</span>
          </div>
        </div>
        <div className="custom-field">
          <label>Protein</label>
          <div className="field-with-unit">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={protein} placeholder="0"
              onChange={e => setProtein(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={e => e.target.select()} />
            <span>g</span>
          </div>
        </div>
      </div>
      <div className="custom-fields-row">
        <div className="custom-field">
          <label>Carbs</label>
          <div className="field-with-unit">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={carbs} placeholder="0"
              onChange={e => setCarbs(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={e => e.target.select()} />
            <span>g</span>
          </div>
        </div>
        <div className="custom-field">
          <label>Fat</label>
          <div className="field-with-unit">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={fat} placeholder="0"
              onChange={e => setFat(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={e => e.target.select()} />
            <span>g</span>
          </div>
        </div>
      </div>
      <button className="add-modal-save" onClick={handleLog} disabled={!calories}>
        <Check size={15} /> Log Entry
      </button>
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
  /** Opens straight into the camera — used by the dashboard's "Snap Meal" quick action. */
  autoOpenPhoto?: boolean
}

function EntryModal({ date, mealIds, mealLabels, existing, defaultMealId, onClose, onSaved, autoOpenPhoto }: EntryModalProps) {
  const isEdit = !!existing
  const [tab,      setTab]      = useState<'quick' | 'custom' | 'ai' | 'photo' | 'quicklog'>(
    isEdit ? 'custom' : isAiMealParsingAvailable ? 'photo' : 'quick'
  )
  const [loggingAi, setLoggingAi] = useState(false)
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

  async function handleLogAiItems(aiItems: { food: string; calories: number; proteinG: number; carbsG: number; fatG: number; quantity: string }[]) {
    setLoggingAi(true)
    for (const it of aiItems) {
      await addNutritionEntry({ date, mealType: mealId, ...it })
    }
    setLoggingAi(false)
    onSaved()
    onClose()
  }

  async function handleLogQuickItem(item: { food: string; calories: number; proteinG: number; carbsG: number; fatG: number; quantity: string }) {
    setLoggingAi(true)
    await addNutritionEntry({ date, mealType: mealId, ...item })
    setLoggingAi(false)
    onSaved()
    onClose()
  }

  function goToManualEntry() { setTab('quicklog') }

  const searchLower = search.trim().toLowerCase()
  const visibleCustom = customFoods.filter(f => !searchLower || f.food.toLowerCase().includes(searchLower))
  const visiblePresets = QUICK_FOODS.filter(f => !searchLower || f.food.toLowerCase().includes(searchLower))

  return createPortal(
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
            {isAiMealParsingAvailable && (
              <button className={tab === 'photo' ? 'active' : ''} onClick={() => setTab('photo')}>
                <Camera size={13} /> Photo
              </button>
            )}
            {isAiMealParsingAvailable && (
              <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
                <Sparkles size={13} /> Describe
              </button>
            )}
            <button className={tab === 'quick' ? 'active' : ''} onClick={() => setTab('quick')}>Quick Add</button>
            <button className={tab === 'quicklog' ? 'active' : ''} onClick={() => setTab('quicklog')}>
              <Zap size={13} /> Quick Log
            </button>
            <button className={tab === 'custom' ? 'active' : ''} onClick={() => setTab('custom')}>Custom</button>
          </div>
        )}

        <div className="add-modal-body">
          {loggingAi ? (
            <div className="ai-logging"><Loader2 size={18} className="ai-spin" /> Logging…</div>
          ) : tab === 'photo' ? (
            <PhotoMealTab onLogged={handleLogAiItems} onFallbackToManual={goToManualEntry} autoOpen={autoOpenPhoto} />
          ) : tab === 'ai' ? (
            <AiMealTab onLogged={handleLogAiItems} onFallbackToManual={goToManualEntry} />
          ) : tab === 'quicklog' ? (
            <QuickLogTab onLogged={handleLogQuickItem} />
          ) : tab === 'quick' ? (
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
    </div>,
    document.body
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NutritionPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { mealIds, activeMealLabels, goals, loaded } = useNutritionSettings()
  const [entries,       setEntries]      = useState<NutritionEntry[]>([])
  const [totals,        setTotals]       = useState({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 })
  // "Snap Meal" dashboard quick action links here with ?quick=photo — jump
  // straight into the camera with no extra taps.
  const [showModal,     setShowModal]    = useState(searchParams.get('quick') === 'photo')
  const [autoOpenPhoto, setAutoOpenPhoto] = useState(searchParams.get('quick') === 'photo')
  const [editEntry,     setEditEntry]    = useState<NutritionEntry | null>(null)
  const [addToMealId,   setAddToMealId]  = useState<string | undefined>()
  const [hasEverLogged, setHasEverLogged] = useState<boolean | null>(null)
  const [calorieHistory, setCalorieHistory] = useState<ChartPoint[]>([])
  const [streak,         setStreak]         = useState(0)
  const [weekLogged,     setWeekLogged]     = useState<Set<string>>(new Set())
  const [viewDate,       setViewDate]       = useState(todayStr)
  const realToday = todayStr()
  const date = viewDate
  const isToday = date === realToday
  const weekStart = startOfWeek(date)
  const thisWeekDates = weekDates(weekStart)

  useEffect(() => {
    if (searchParams.get('quick') === 'photo') {
      setSearchParams(prev => { prev.delete('quick'); return prev }, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      {/* ── Date nav — log or review any day, past or future ── */}
      <div className="nutr-date-nav">
        <button className="nutr-date-nav-btn" onClick={() => setViewDate(d => offsetDateStr(d, -1))} aria-label="Previous day">
          <ChevronLeft size={16} />
        </button>
        <span className="nutr-date-nav-label">{isToday ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <button className="nutr-date-nav-btn" onClick={() => setViewDate(d => offsetDateStr(d, 1))} aria-label="Next day">
          <ChevronRight size={16} />
        </button>
        {!isToday && (
          <button className="nutr-date-nav-today" onClick={() => setViewDate(realToday)}>Jump to Today</button>
        )}
      </div>

      <WeekStreakBar dates={thisWeekDates} logged={weekLogged} today={realToday} viewDate={viewDate} onSelectDate={setViewDate} streak={streak} />

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
          autoOpenPhoto={autoOpenPhoto}
          onClose={() => { setShowModal(false); setEditEntry(null); setAutoOpenPhoto(false) }}
          onSaved={() => { load(); loadStreak(); setHasEverLogged(true) }} />
      )}
    </div>
  )
}
