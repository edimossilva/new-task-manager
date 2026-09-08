/**
 * `once` is the odd one out: a task with no cadence, done a single time. It
 * still rides the completion model, with a period key that never changes, so
 * "done" is permanent instead of re-arming when a period turns over.
 */
export type TaskFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * ISO-8601 weekday, Monday = 1 through Sunday = 7.
 *
 * Monday-first matters: the whole weekday feature is a `>=` comparison, which
 * only holds if position-in-week grows with time. `Date.getDay()`'s Sunday-first
 * 0..6 makes Sunday the smallest value while being the last day.
 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * Upper bound on `timesPerPeriod`. Fifty is past any real habit -- a glass of
 * water every twenty waking minutes -- and keeps one period's worth of repeated
 * keys a rounding error against the completions cap.
 */
export const MAX_TIMES_PER_PERIOD = 50

/**
 * Anything unusable collapses to 1, which is what every task stored before the
 * feature is: a single check-off per period.
 */
export function normalizeTimesPerPeriod(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return 1
  return Math.min(value, MAX_TIMES_PER_PERIOD)
}

/**
 * One check-off. The key says WHICH period it belongs to, `at` says WHEN the
 * box was actually ticked -- the two are different questions, and a yearly task
 * ticked four times in 2026 answers the first identically four times over.
 */
export interface Completion {
  /** Period key from `periodKey(frequency, date)`. */
  key: string
  /** Absent on check-offs written before the moment was recorded. */
  at?: Date
}

export interface Task {
  id: string
  title: string
  description?: string
  frequency: TaskFrequency
  /** Optional reference to a Category. Existing tasks predate categories. */
  categoryId?: string
  /** Only meaningful for `weekly`. undefined = any day of the week. */
  weekday?: Weekday
  /**
   * How many check-offs the period needs before the task counts as done. Always
   * at least 1; tasks written before the feature deserialize to exactly that.
   */
  timesPerPeriod: number
  /**
   * Off means "not part of the routine right now": the task keeps its history
   * and stays on the tasks page, but the home page never shows it. Absent on
   * documents written before the flag, which read as active.
   */
  active: boolean
  /**
   * Check-offs, ascending by period key.
   *
   * A key REPEATS once per check-off, so a task needing three a day holds three
   * entries for that day once done. Counting occurrences rather than storing a
   * tally keeps rollover derived: nothing has to be reset when the period turns
   * over, and each entry keeps its own `at` so the history stays readable.
   */
  completions: Completion[]
  createdAt: Date
  updatedAt: Date
}

export interface CreateTaskInput {
  title: string
  description?: string
  frequency: TaskFrequency
  categoryId?: string
  weekday?: Weekday
  timesPerPeriod?: number
}

export function createTask(input: CreateTaskInput): Task {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    frequency: input.frequency,
    categoryId: input.categoryId,
    weekday: input.weekday,
    timesPerPeriod: normalizeTimesPerPeriod(input.timesPerPeriod),
    active: true,
    completions: [],
    createdAt: now,
    updatedAt: now,
  }
}
