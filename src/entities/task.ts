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
 * Time of day, Manha = 1, Tarde = 2, Noite = 3.
 *
 * Numeric and ordered for the same reason `Weekday` is: lateness is a `<=`
 * comparison over position within the period. The difference is that
 * `getHours()` is already chronological, so this type is not fixing a broken
 * platform convention -- it exists to name the three slices, give them a stable
 * persisted encoding, and make `turnOf` their only producer.
 */
export type Turn = 1 | 2 | 3

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
 * Anything unusable collapses to an empty plan, which is what every task stored
 * before turns existed is: no check-off pinned to a time of day.
 *
 * Sorted ascending and truncated to the target. Truncation is what makes
 * lowering `timesPerPeriod` safe without a migration, and it keeps the EARLIEST
 * slots because a deadline already passed is the one that still matters. Values
 * outside 1..3 are dropped rather than clamped, the rule `toWeekday` follows: a
 * turn nothing can satisfy would leave the task permanently overdue.
 */
export function normalizeTurns(value: unknown, timesPerPeriod: number): Turn[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((turn): turn is Turn => turn === 1 || turn === 2 || turn === 3)
    .sort((a, b) => a - b)
    .slice(0, normalizeTimesPerPeriod(timesPerPeriod))
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
  /**
   * The task this one is a step of, or undefined for a task that stands alone.
   *
   * A step counts as a task of its own everywhere in the app; the task it is
   * filed under counts as NOTHING, being a container rather than work. The
   * container is never marked as one -- see `parentIds` -- and a step inherits
   * its frequency, weekday and category, so a group can never be split across
   * two bands or two rack units.
   */
  parentId?: string
  /** Only meaningful for `weekly`. undefined = any day of the week. */
  weekday?: Weekday
  /**
   * How many check-offs the period needs before the task counts as done. Always
   * at least 1; tasks written before the feature deserialize to exactly that.
   */
  timesPerPeriod: number
  /**
   * The time of day each required check-off is pinned to, ASCENDING, at most
   * `timesPerPeriod` long. Always an array: an empty one is "no turn plan",
   * which is what every task written before the feature means.
   *
   * Crediting is POSITIONAL -- the Nth check-off of the day satisfies the Nth
   * entry here, and the unpinned remainder sorts after all of them, so an
   * untimed check-off can never be the reason a turn is late. Nothing on a
   * `Completion` records which slot it filled; see `dueByNow`.
   *
   * Only meaningful for `daily`, a turn being a slice of ONE day. The invariant
   * is enforced in create/update, where "weekday set implies weekly" already is.
   */
  turns: Turn[]
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
  parentId?: string
  weekday?: Weekday
  timesPerPeriod?: number
  turns?: Turn[]
  /** Defaults to true: a task is in the routine unless the form says otherwise. */
  active?: boolean
}

/**
 * The ids in `tasks` that some other task in the set is filed under.
 *
 * Parenthood is DERIVED, never stored: a task becomes a container the moment a
 * step is filed under it and stops being one when the last step goes, so there
 * is no flag to keep in step with the steps themselves and nothing to migrate.
 * It is the same move the app makes with rollover -- read the state, never
 * write it -- and it is what makes "the container counts as nothing" a single
 * `Set` lookup at every place the app counts.
 *
 * The caller must hand in an array CLOSED under the relation: one that holds a
 * container holds its steps. Every counting method is handed such an array by
 * construction, because a step inherits its container's frequency and category
 * and so can never be filtered into a different band or unit. The one place
 * that can break it is the home page, which also gates on `active` and
 * `isDueOn`; it closes the set itself.
 */
export function parentIds(tasks: Task[]): Set<string> {
  const parents = new Set<string>()
  for (const task of tasks) {
    if (task.parentId) parents.add(task.parentId)
  }
  return parents
}

/**
 * Whether this task is a STEP: filed under something, and not itself holding
 * steps of its own.
 *
 * The second half is what makes the model cycle-proof without a single guard on
 * the read path. The write path refuses to build a chain, but a hand-edited or
 * half-written document can still carry one, and a task that is a container AND
 * carries a `parentId` resolves as a container with its own `parentId` ignored.
 * A two-task cycle therefore reads as two ordinary tasks rather than as a walk
 * that never ends -- the same trade `use-category-rack` makes for a task
 * pointing at a category that is gone.
 */
export function isSubtask(task: Task, parents: Set<string>): boolean {
  return task.parentId !== undefined && !parents.has(task.id)
}

export function createTask(input: CreateTaskInput): Task {
  const now = new Date()
  // Hoisted because the turn plan is truncated against the target, and an object
  // literal cannot read its own sibling.
  const timesPerPeriod = normalizeTimesPerPeriod(input.timesPerPeriod)
  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    frequency: input.frequency,
    categoryId: input.categoryId,
    parentId: input.parentId,
    weekday: input.weekday,
    timesPerPeriod,
    turns: normalizeTurns(input.turns, timesPerPeriod),
    active: input.active ?? true,
    completions: [],
    createdAt: now,
    updatedAt: now,
  }
}
