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
