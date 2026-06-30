import { useState, useEffect, useRef } from 'react'
import type { ChartPoint } from '../db/timelineStore'
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
  unit?: string
  formatValue?: (v: number) => string
  goalValue?: number
  height?: number
}

function filterByPeriod(data: ChartPoint[], period: ChartPeriod): ChartPoint[] {
  const days = PERIOD_DAYS[period]
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
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
  data, period, color = 'var(--blue)', unit = '', formatValue, goalValue, height = 120,
}: Props) {
  const containerRef = useRef<SVGSVGElement>(null)
  const [animated, setAnimated] = useState(false)
  const [width, setWidth] = useState(320)

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

  const values = filtered.map(p => p.value)
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

  return (
    <div className="trend-chart-wrap">
      <div className="trend-chart-header">
        <span className="trend-chart-value">{latest}{unit}</span>
        <span className={`trend-chart-delta ${change < 0 ? 'down' : change > 0 ? 'up' : ''}`}>
          {change > 0 ? '+' : ''}{fmt(change)}{unit}
        </span>
      </div>

      <svg
        ref={containerRef}
        className="trend-svg"
        viewBox={`0 0 ${w} ${h}`}
        style={{ height, width: '100%' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`trend-grad-${color.replace(/[^a-z]/gi, '')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <clipPath id="trend-clip">
            <rect x="0" y="0" width={animated ? w : 0} height={h} style={{ transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
          </clipPath>
        </defs>

        {/* Goal line */}
        {goalY != null && goalY > 0 && goalY < h - padBottom && (
          <>
            <line
              x1={padX} y1={goalY} x2={w - padX} y2={goalY}
              stroke="var(--green)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5"
            />
            <text x={w - padX - 2} y={goalY - 4} textAnchor="end" fontSize="9" fill="var(--green)" opacity="0.7">goal</text>
          </>
        )}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#trend-grad-${color.replace(/[^a-z]/gi, '')})`} clipPath="url(#trend-clip)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
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
            r="4"
            fill={color}
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
