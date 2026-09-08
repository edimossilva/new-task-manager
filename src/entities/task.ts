export type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

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
   * Period keys already completed, ascending. e.g. ['2026-08-31', '2026-09-01']
   *
   * A key REPEATS once per check-off, so a task needing three a day reads
   * ['2026-09-01', '2026-09-01', '2026-09-01'] once done. Counting occurrences
   * rather than storing a tally keeps rollover derived: nothing has to be reset
   * when the period turns over.
   */
  completions: string[]
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
    completions: [],
    createdAt: now,
    updatedAt: now,
  }
}
