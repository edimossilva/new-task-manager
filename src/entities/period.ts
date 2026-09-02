import type { TaskFrequency } from './task'

/**
 * Sort weight for frequencies. Sorting on the label would order them
 * alphabetically (Anual, Diaria, Mensal, Semanal), which reads as noise.
 */
export const FREQUENCY_ORDER: Record<TaskFrequency, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  yearly: 3,
}

export const FREQUENCIES: TaskFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

export const FREQUENCY_LABELS: Record<TaskFrequency, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
}

/** Portuguese month names, without diacritics, matching the rest of the UI. */
export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const CURRENT_PERIOD_LABELS: Record<TaskFrequency, string> = {
  daily: 'Hoje',
  weekly: 'Esta semana',
  monthly: 'Este mes',
  yearly: 'Este ano',
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * ISO-8601 week number and its ISO week-year, which can differ from the calendar
 * year: 2025-12-29 falls in 2026-W01. Week 1 is the one containing the first
 * Thursday, and weeks start on Monday.
 */
export function isoWeek(date: Date): { year: number; week: number } {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOfWeek = (target.getDay() + 6) % 7 // Monday = 0
  target.setDate(target.getDate() - dayOfWeek + 3) // Thursday of this ISO week

  const isoYear = target.getFullYear()
  const firstThursday = new Date(isoYear, 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)

  // Both dates are the Thursday of their week, so the gap is an exact multiple
  // of 7 days and Math.round absorbs any DST shift along the way.
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return { year: isoYear, week }
}

export function isoWeekKey(date: Date): string {
  const { year, week } = isoWeek(date)
  return `${year}-W${pad(week)}`
}

/**
 * Stable identifier for the period `date` falls in, for the given frequency.
 *
 * Every getter is local-time on purpose. `toISOString().slice(0, 10)` would hand
 * anyone west of UTC tomorrow's key after 21:00, so "today" would roll over
 * hours early.
 */
export function periodKey(frequency: TaskFrequency, date: Date = new Date()): string {
  switch (frequency) {
    case 'daily':
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    case 'weekly':
      return isoWeekKey(date)
    case 'monthly':
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
    case 'yearly':
      return String(date.getFullYear())
  }
}

/** Human label for a period key: the current one gets a name, older ones stay raw. */
export function formatPeriodLabel(
  frequency: TaskFrequency,
  key: string,
  referenceDate: Date = new Date(),
): string {
  if (key === periodKey(frequency, referenceDate)) return CURRENT_PERIOD_LABELS[frequency]
  return key
}

/** Days in a month. `month` is 1-based, matching the period-key format. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Same calendar day in local time. Timestamps would compare the clock too. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const KEY_PATTERNS: Record<TaskFrequency, RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}$/,
  weekly: /^\d{4}-W\d{2}$/,
  monthly: /^\d{4}-\d{2}$/,
  yearly: /^\d{4}$/,
}

/**
 * Whether a stored key was written under this frequency.
 *
 * Changing a task's frequency leaves the old keys in place, so `completions` can
 * hold a mix of formats. Lexicographic order does not interleave them
 * chronologically -- within one year `2026` < `2026-09` < `2026-09-01` < `2026-W01`
 * -- so anything that reads "the latest completion" has to filter first.
 */
export function matchesFrequency(frequency: TaskFrequency, key: string): boolean {
  return KEY_PATTERNS[frequency].test(key)
}

/** dd/mm/yyyy, the format the period selector shows. */
export function formatDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}
