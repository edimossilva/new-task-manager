import type { TaskFrequency, Weekday } from './task'

/**
 * Sort weight for frequencies. Sorting on the label would order them
 * alphabetically (Anual, Diaria, Mensal, Semanal), which reads as noise.
 */
export const FREQUENCY_ORDER: Record<TaskFrequency, number> = {
  once: 0,
  daily: 1,
  weekly: 2,
  monthly: 3,
  yearly: 4,
}

/** One-offs lead: a task with no cadence is the one thing today that will not come back. */
export const FREQUENCIES: TaskFrequency[] = ['once', 'daily', 'weekly', 'monthly', 'yearly']

export const FREQUENCY_LABELS: Record<TaskFrequency, string> = {
  once: 'Unica',
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
}

/**
 * Field label for `timesPerPeriod`, named after the period the frequency spans.
 * 'Vezes por periodo' is technically right and reads like a form nobody wrote.
 */
export const TIMES_PER_PERIOD_LABELS: Record<TaskFrequency, string> = {
  once: 'Vezes no total',
  daily: 'Vezes por dia',
  weekly: 'Vezes por semana',
  monthly: 'Vezes por mes',
  yearly: 'Vezes por ano',
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
  once: 'Concluida',
  daily: 'Hoje',
  weekly: 'Esta semana',
  monthly: 'Este mes',
  yearly: 'Este ano',
}

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Segunda',
  2: 'Terca',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sabado',
  7: 'Domingo',
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sab',
  7: 'Dom',
}

/** ISO-8601 weekday, Monday = 1 .. Sunday = 7. The only `getDay()` call in the app. */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
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
  const dayOfWeek = isoWeekday(target) - 1 // Monday = 0
  target.setDate(target.getDate() - dayOfWeek + 3) // Thursday of this ISO week

  const isoYear = target.getFullYear()
  const firstThursday = new Date(isoYear, 0, 4)
  firstThursday.setDate(firstThursday.getDate() - (isoWeekday(firstThursday) - 1) + 3)

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
    // No period, so no date in the key: a one-off checked off stays checked off,
    // which is the whole difference between it and a daily.
    case 'once':
      return 'once'
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
  once: /^once$/,
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

/** dd/mm/yyyy HH:MM, for a check-off's own moment. Local, like every other reading. */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
