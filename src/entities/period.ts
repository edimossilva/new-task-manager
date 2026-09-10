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

/** Three letters, for an axis label that has to repeat twelve times in a row. */
export const MONTH_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

/**
 * What ONE period of each cadence is called, for a figure that counts them --
 * a streak of 12 is 12 dias on a daily task and 12 semanas on a weekly one.
 */
export const PERIOD_NOUNS: Record<TaskFrequency, { one: string; many: string }> = {
  once: { one: 'vez', many: 'vezes' },
  daily: { one: 'dia', many: 'dias' },
  weekly: { one: 'semana', many: 'semanas' },
  monthly: { one: 'mes', many: 'meses' },
  yearly: { one: 'ano', many: 'anos' },
}

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
 * Monday of the ISO week containing `date`, at noon.
 *
 * Noon for the reason `period-store` builds its dates there: local midnight does
 * not exist on a DST-transition day in some zones, and the shift would move the
 * result to the wrong day. Monday-first is not a preference either -- weekly
 * tasks are keyed on the ISO week, so this is exactly the span one weekly
 * completion covers.
 */
export function weekStart(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  monday.setDate(monday.getDate() - (isoWeekday(monday) - 1))
  return monday
}

/** The seven days of that week, Monday first. */
export function weekDates(date: Date): Date[] {
  const monday = weekStart(date)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + index)
    return day
  })
}

/** `date` shifted by whole weeks, normalized to the resulting week's Monday. */
export function addWeeks(date: Date, weeks: number): Date {
  const monday = weekStart(date)
  monday.setDate(monday.getDate() + weeks * 7)
  return monday
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

/**
 * The day a `daily` period key names, or null for a key in any other format.
 *
 * Built field by field on purpose: `new Date('2026-09-01')` is parsed as UTC, so
 * anywhere west of it the key would name the day before. Noon, like every other
 * date this app constructs.
 */
export function parseDailyKey(key: string): Date | null {
  if (!matchesFrequency('daily', key)) return null
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!, 12)
  // Re-deriving the key IS the range check: `new Date(2026, 1, 31)` rolls over
  // to 2 March, so a hand-edited `2026-02-31` would otherwise name a real day
  // in the wrong month. One round trip beats a table of month lengths.
  return periodKey('daily', date) === key ? date : null
}

/** `W37`, the label a trend bar wears. The week number alone, never the year. */
export function formatWeekShort(date: Date): string {
  return `W${pad(isoWeek(date).week)}`
}

/** `07/09 - 13/09`, the span of the week containing `date`. */
export function formatWeekRange(date: Date): string {
  const days = weekDates(date)
  const first = days[0]!
  const last = days[6]!
  return `${pad(first.getDate())}/${pad(first.getMonth() + 1)} - ${pad(last.getDate())}/${pad(last.getMonth() + 1)}`
}

/**
 * `date` shifted by whole periods of `frequency`, at noon.
 *
 * Every case lands on a day that is guaranteed to exist, which is the whole
 * point: stepping back one month from the 31st would otherwise roll FORWARD
 * into the following month, and a chart walking twelve of those would skip
 * February entirely. Only the resulting period matters, never the day inside
 * it, so the first of the month and of the year are the safe representatives.
 */
export function addPeriods(frequency: TaskFrequency, date: Date, amount: number): Date {
  switch (frequency) {
    // No cadence, so no step: a one-off is its own only period.
    case 'once':
      return new Date(date)
    case 'daily':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12)
    case 'weekly':
      return addWeeks(date, amount)
    case 'monthly':
      return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12)
    case 'yearly':
      return new Date(date.getFullYear() + amount, 0, 1, 12)
  }
}

/**
 * The Monday of the ISO week a `weekly` key names, or null for anything else.
 *
 * 4 January is in ISO week 1 by definition, whatever weekday it falls on, so
 * it is the one fixed point every year has. Re-deriving the key IS the range
 * check, the same trade `parseDailyKey` makes: most years have 52 weeks, and
 * `2025-W53` names no week at all.
 */
export function parseWeekKey(key: string): Date | null {
  if (!matchesFrequency('weekly', key)) return null
  const [yearPart, weekPart] = key.split('-W')
  const monday = weekStart(new Date(Number(yearPart), 0, 4, 12))
  monday.setDate(monday.getDate() + (Number(weekPart) - 1) * 7)
  return isoWeekKey(monday) === key ? monday : null
}

/** Whole days from the UTC epoch. UTC on purpose: it has no DST to absorb. */
function utcDayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

/**
 * A monotonic INDEX for the period a key names: two consecutive periods differ
 * by exactly 1, and subtracting two indices counts the periods between them.
 *
 * This is what makes a streak arithmetic rather than a walk: keys are strings
 * whose successor is not computable by hand (`2026-W52` is followed by
 * `2026-W53` in some years and `2027-W01` in others), and a year is not a fixed
 * number of weeks, so `year * 53 + week` is not linear.
 *
 * A one-off has no cadence and therefore no index. Null too for a key written
 * under a frequency the task has since left: it is real work, but it cannot be
 * placed on this cadence's number line.
 */
export function periodIndex(frequency: TaskFrequency, key: string): number | null {
  if (!matchesFrequency(frequency, key)) return null
  switch (frequency) {
    case 'once':
      return null
    case 'daily': {
      const day = parseDailyKey(key)
      return day ? utcDayNumber(day) : null
    }
    case 'weekly': {
      const monday = parseWeekKey(key)
      // The epoch is a THURSDAY, so Mondays sit at 4 mod 7; without the offset
      // the division would not land on an integer.
      return monday ? (utcDayNumber(monday) - 4) / 7 : null
    }
    case 'monthly': {
      const [year, month] = key.split('-').map(Number)
      return year! * 12 + (month! - 1)
    }
    case 'yearly':
      return Number(key)
  }
}

/** The label one period wears on a chart axis, where there is room for four characters. */
export function formatPeriodShort(frequency: TaskFrequency, key: string): string {
  switch (frequency) {
    case 'once':
      return 'Unica'
    case 'daily': {
      const [, month, day] = key.split('-')
      return `${day}/${month}`
    }
    case 'weekly':
      return `W${key.split('-W')[1]}`
    case 'monthly':
      return MONTH_SHORT[Number(key.split('-')[1]) - 1] ?? key
    case 'yearly':
      return key
  }
}

/** dd/mm/yyyy, the format the period selector shows. */
export function formatDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

/** dd/mm/yyyy HH:MM, for a check-off's own moment. Local, like every other reading. */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
