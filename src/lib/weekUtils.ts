// ─── ISO Week helpers ─────────────────────────────────────────────────────────
// Shared by WorkoutsPage's WeekCalendar and the History tab's muscle heatmap
// (Week mode) — pure date-math, no React.

export function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return {
    week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
    year: d.getUTCFullYear(),
  }
}

export function getWeekDates(isoWeek: number, year: number): string[] {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekStart = new Date(jan4)
  weekStart.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (isoWeek - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(weekStart.getUTCDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export function addWeeks(week: number, year: number, delta: number): { week: number; year: number } {
  const d = new Date(getWeekDates(week, year)[0] + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta * 7)
  return getISOWeek(d)
}

export const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatWeekLabel(dates: string[]) {
  if (!dates.length) return ''
  const a = new Date(dates[0] + 'T12:00:00')
  const b = new Date(dates[6] + 'T12:00:00')
  const sameMonth = a.getMonth() === b.getMonth()
  return sameMonth
    ? `${MONTH_SHORT[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MONTH_SHORT[a.getMonth()]} ${a.getDate()} – ${MONTH_SHORT[b.getMonth()]} ${b.getDate()}`
}
