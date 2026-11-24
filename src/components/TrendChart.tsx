import { useState, useEffect, useRef } from 'react'
import type { ChartPoint } from '../db/timelineStore'
import { localDateStr, addLocalDays } from '../data/config'
import './TrendChart.css'

export type ChartPeriod = '7d' | '30d' | '90d' | 'all'

const PERIOD_DAYS: Record<ChartPeriod, number> = {
  '7d':  7,
  '30d': 30,
  '90d': 90,
  'all': 3650,
}

interface Props {
  data: ChartPoint[]
  period: ChartPeriod
  color?: string
  /** Draws the line (and current-point dot) in the app's brand gradient
      instead of a flat color — opt-in, since most TrendChart usages pass
      their own distinct metric color and shouldn't all turn into the same
      rainbow line. The area-fill wash underneath still uses `color` (a
      flat gradient-opacity fade reads oddly at this small a scale). */
  gradient?: boolean
  unit?: string
  formatValue?: (v: number) => string
  goalValue?: number
  height?: number
}

function filterByPeriod(data: ChartPoint[], period: ChartPeriod): ChartPoint[] {
  const days = PERIOD_DAYS[period]
  const cutoffStr = addLocalDays(localDateStr(), -days)
  return data.filter(p => p.date >= cutoffStr)
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const parts: string[] = [`M${points[0].x},${points[0].y}`]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cpx  = (prev.x + curr.x) / 2
    parts.push(`C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`)
  }
  return parts.join(' ')
}

export default function TrendChart({
  data, period, color = 'var(--accent)', gradient = false, unit = '', formatValue, goalValue, height = 120,
}: Props) {
  const containerRef = useRef<SVGSVGElement>(null)
  const [animated, setAnimated] = useState(false)
  const [width, setWidth] = useState(320)
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width || 320)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50)
    return () => clearTimeout(t)
  }, [data, period])

  const filtered = filterByPeriod(data, period)
  if (filtered.length === 0) return (
    <div className="trend-empty">No {unit || 'data'} for this period</div>
  )

  const padX = 8, padY = 14, padBottom = 28
  const w = Math.max(width, 100)
  const h = height

  // The target line needs to fall inside the plotted range to ever be
  // visible at all — folding goalValue into the min/max means a target
  // well above or below the actual logged values still shows up (clamped
  // near the top/bottom edge) instead of silently not rendering.
  const values = goalValue != null ? [...filtered.map(p => p.value), goalValue] : filtered.map(p => p.value)
  const minV   = Math.min(...values)
  const maxV   = Math.max(...values)
  const range  = maxV - minV || 1

  const xScale = (i: number) => padX + ((w - padX * 2) / Math.max(filtered.length - 1, 1)) * i
  const yScale = (v: number) => padY + ((h - padY - padBottom) * (1 - (v - minV) / range))

  const pts    = filtered.map((p, i) => ({ x: xScale(i), y: yScale(p.value) }))
  const linePath = smoothPath(pts)
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${h - padBottom} L${pts[0].x},${h - padBottom} Z`

  const fmt = formatValue ?? ((v: number) => v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1))
  const lastVal  = filtered[filtered.length - 1].value
  const firstVal = filtered[0].value
  const change   = lastVal - firstVal
  const latest   = fmt(lastVal)

  // X-axis label indices
  const labelCount = Math.min(filtered.length, period === '7d' ? 7 : 5)
  const labelIndices: number[] = []
  for (let i = 0; i < labelCount; i++) {
    labelIndices.push(Math.round((filtered.length - 1) * (i / Math.max(labelCount - 1, 1))))
  }
  // Deduplicate and bound
  const uniqueIndices = [...new Set(labelIndices)].filter(i => i >= 0 && i < filtered.length)

  function fmtDateLabel(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const goalY = goalValue != null ? yScale(goalValue) : null

  // Tap-or-drag day scrubbing — finds the nearest plotted point to the
  // pointer's x position and shows that day's own value instead of
  // leaving "what was logged on any day but the last" undiscoverable.
  function updateScrubFromClientX(clientX: number) {
    const el = containerRef.current
    if (!el || filtered.length === 0) return
    const rect = el.getBoundingClientRect()
    const relX = ((clientX - rect.left) / rect.width) * w
    let nearest = 0
    let nearestDist = Infinity
    for (let i = 0; i < pts.length; i++) {
      const dist = Math.abs(pts[i].x - relX)
      if (dist < nearestDist) { nearestDist = dist; nearest = i }
    }
    setScrubIndex(nearest)
  }

  const scrubPoint = scrubIndex != null ? filtered[scrubIndex] : null

  return (
    <div className="trend-chart-wrap">
      <div className="trend-chart-header">
        {scrubPoint ? (
          <>
            <span className="trend-chart-value">{fmt(scrubPoint.value)}{unit}</span>
            <span className="trend-chart-scrub-date">{fmtDateLabel(scrubPoint.date)}</span>
          </>
        ) : (
          <>
            <span className="trend-chart-value">{latest}{unit}</span>
            {/* A chart with its own goalValue (a target line, drawn below)
                already gives the more useful comparison — "today vs
                target" — so the day-over-day delta here is skipped for
                those: with sparse history (e.g. only today actually
                logged, every other day 0), the delta against a mostly-
                zero week just re-states today's value with a minus sign,
                which reads as a confusing duplicate rather than a real
                trend. */}
            {goalValue == null && (
              <span className={`trend-chart-delta ${change < 0 ? 'down' : change > 0 ? 'up' : ''}`}>
                {change > 0 ? '+' : ''}{fmt(change)}{unit}
              </span>
            )}
          </>
        )}
      </div>

      <svg
        ref={containerRef}
        className="trend-svg trend-svg--scrubbable"
        viewBox={`0 0 ${w} ${h}`}
        style={{ height, width: '100%', touchAction: 'pan-y' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); updateScrubFromClientX(e.clientX) }}
        onPointerMove={e => { if (e.buttons > 0 || e.pointerType === 'touch') updateScrubFromClientX(e.clientX) }}
        onPointerUp={() => setScrubIndex(null)}
        onPointerCancel={() => setScrubIndex(null)}
        onPointerLeave={() => setScrubIndex(null)}
      >
        <defs>
          <linearGradient id={`trend-grad-${color.replace(/[^a-z]/gi, '')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          {gradient && (
            <>
              <linearGradient id="trend-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FB8A4C" />
                <stop offset="50%" stopColor="#A66BF5" />
                <stop offset="100%" stopColor="#5B7FFF" />
              </linearGradient>
              {/* Diagonal, not vertical — an SVG linearGradient only varies
                  along one axis, so this is what lets the area "shadow"
                  carry the same orange→purple→blue hues as the line above
                  it while still fading out toward the bottom, in one def. */}
              <linearGradient id="trend-area-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FB8A4C" stopOpacity="0.22" />
                <stop offset="50%" stopColor="#A66BF5" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#5B7FFF" stopOpacity="0.05" />
              </linearGradient>
              {/* Radial, not linear, for the dot markers — at this diameter a
                  left-to-right linear gradient has no room to blend and
                  just reads as two flat color halves stacked on each other.
                  Centered (not offset) — an off-center radial at this small
                  a size reads as a distinct orange hotspot sitting inside a
                  separate purple/blue ring rather than one blended dot, so
                  this stays a concentric sweep from the center outward. */}
              <radialGradient id="trend-dot-gradient" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#FB8A4C" />
                <stop offset="40%" stopColor="#E4849C" />
                <stop offset="70%" stopColor="#A66BF5" />
                <stop offset="100%" stopColor="#5B7FFF" />
              </radialGradient>
            </>
          )}
          <clipPath id="trend-clip">
            <rect x="0" y="0" width={animated ? w : 0} height={h} style={{ transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
          </clipPath>
        </defs>

        {/* Target line — rainbow-stroked to match the line/dot above it when
            gradient is on, labeled on the LEFT so it reads immediately
            instead of being squeezed against the current-point dot on the
            right, with its own rainbow dot marking the target value at the
            line's right end (same marker style as the current-value dot,
            just hollow, so the two read as related but distinct). */}
        {goalY != null && (
          <>
            {/* Starts after the "Target" label (not underneath it) so the
                dashed line reads as its own clearly visible stroke running
                the full remaining width to the right edge, rather than
                disappearing under the text and registering as just the
                dot at the far end. */}
            <line
              x1={padX + 34} y1={goalY} x2={w - padX} y2={goalY}
              stroke={gradient ? 'url(#trend-line-gradient)' : 'var(--accent)'}
              strokeWidth="1.5" strokeDasharray="4 4" opacity="0.85"
            />
            <text x={padX + 2} y={Math.max(9, goalY - 4)} textAnchor="start" fontSize="9"
              fill={gradient ? 'url(#trend-line-gradient)' : 'var(--accent)'} opacity="0.95">Target</text>
            <circle
              cx={w - padX} cy={goalY} r="3.5"
              fill="none"
              stroke={gradient ? 'url(#trend-dot-gradient)' : 'var(--accent)'}
              strokeWidth="1.5"
            />
          </>
        )}

        {/* Area fill */}
        <path d={areaPath} fill={gradient ? 'url(#trend-area-gradient)' : `url(#trend-grad-${color.replace(/[^a-z]/gi, '')})`} clipPath="url(#trend-clip)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={gradient ? 'url(#trend-line-gradient)' : color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#trend-clip)"
        />

        {/* Current point dot */}
        {pts.length > 0 && (
          <circle
            cx={pts[pts.length - 1].x}
            cy={pts[pts.length - 1].y}
            r="5"
            fill={gradient ? 'url(#trend-dot-gradient)' : color}
            opacity={animated ? 1 : 0}
            style={{ transition: 'opacity 0.4s ease 0.7s' }}
          />
        )}

        {/* X-axis labels */}
        {uniqueIndices.map(i => (
          <text
            key={i}
            x={xScale(i)}
            y={h - 6}
            textAnchor={i === 0 ? 'start' : i === filtered.length - 1 ? 'end' : 'middle'}
            fontSize="9"
            fill="var(--text-tertiary)"
          >
            {fmtDateLabel(filtered[i].date)}
          </text>
        ))}

        {/* Scrub guideline + dot — tap or drag anywhere on the chart to see
            any day's own value, not just the latest. */}
        {scrubIndex != null && (
          <>
            <line
              x1={pts[scrubIndex].x} y1={padY} x2={pts[scrubIndex].x} y2={h - padBottom}
              stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"
            />
            <circle
              cx={pts[scrubIndex].x} cy={pts[scrubIndex].y} r="5.5"
              fill={gradient ? 'url(#trend-dot-gradient)' : color}
              stroke="var(--bg-card)" strokeWidth="2"
            />
          </>
        )}
      </svg>
    </div>
  )
}

// ─── Period selector ──────────────────────────────────────────────────────────

export function PeriodSelector({
  period, onChange, available = ['7d', '30d', '90d', 'all'],
}: {
  period: ChartPeriod
  onChange: (p: ChartPeriod) => void
  available?: ChartPeriod[]
}) {
  const labels: Record<ChartPeriod, string> = { '7d': '7D', '30d': '30D', '90d': '90D', 'all': 'All' }
  return (
    <div className="period-selector">
      {available.map(p => (
        <button
          key={p}
          className={`period-btn ${period === p ? 'period-btn--active' : ''}`}
          onClick={() => onChange(p)}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  )
}
