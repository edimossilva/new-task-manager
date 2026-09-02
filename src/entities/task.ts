export type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * ISO-8601 weekday, Monday = 1 through Sunday = 7.
 *
 * Monday-first matters: the whole weekday feature is a `>=` comparison, which
 * only holds if position-in-week grows with time. `Date.getDay()`'s Sunday-first
 * 0..6 makes Sunday the smallest value while being the last day.
 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface Task {
  id: string
  title: string
  description?: string
  frequency: TaskFrequency
  /** Optional reference to a Category. Existing tasks predate categories. */
  categoryId?: string
  /** Only meaningful for `weekly`. undefined = any day of the week. */
  weekday?: Weekday
  /** Period keys already completed, ascending. e.g. ['2026-08-31', '2026-09-01'] */
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
    completions: [],
    createdAt: now,
    updatedAt: now,
  }
}
