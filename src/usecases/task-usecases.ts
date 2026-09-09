import type { Completion, CreateTaskInput, Task } from '@/entities'
import { createTask, isoWeekday, periodKey } from '@/entities'
import type { TaskRepository } from './ports'
import { validateRequiredText, validateTimesPerPeriod } from './validation'

export interface UseCaseResult {
  success: boolean
  error?: string
}

/** Check-level progress over a set of tasks, as `checkTally` reports it. */
export interface CheckTally {
  done: number
  total: number
}

/** One period's worth of check-offs, as `completionHistory` reports it. */
export interface CompletionPeriod {
  key: string
  entries: Completion[]
  /** Epoch ms of the newest recorded moment, or 0 when none of them carry one. */
  latest: number
}

/** Entries sort by period key only, so the order inside a period stays as recorded. */
function byKey(a: Completion, b: Completion): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/**
 * Retention cap for `completions`: ten years of once-a-day check-offs. At a key
 * plus a timestamp per entry that is a few hundred KB, inside Firestore's 1 MiB
 * per-document limit, and it keeps retention from being something the UI has to
 * be tuned around. A task checked several times a day spends the budget
 * proportionally faster -- eight a day still buys well over a year of history.
 */
const MAX_COMPLETIONS = 3650

export class TaskUseCases {
  constructor(private taskRepo: TaskRepository) {}

  getAll(): Task[] {
    return this.taskRepo.getAll()
  }

  getById(id: string): Task | undefined {
    return this.taskRepo.getById(id)
  }

  create(input: CreateTaskInput): UseCaseResult {
    const error =
      validateRequiredText(input.title, 'Titulo') ??
      validateTimesPerPeriod(input.timesPerPeriod ?? 1)
    if (error) return { success: false, error }

    this.taskRepo.create(
      createTask({
        ...input,
        title: input.title.trim(),
        weekday: input.frequency === 'weekly' ? input.weekday : undefined,
      }),
    )
    return { success: true }
  }

  update(task: Task): UseCaseResult {
    const error =
      validateRequiredText(task.title, 'Titulo') ?? validateTimesPerPeriod(task.timesPerPeriod)
    if (error) return { success: false, error }

    // Changing the frequency leaves the old period keys in place. They can never
    // match a lookup in the new format, so the task correctly shows as pending,
    // and keeping them costs nothing while preserving the history.
    //
    // The weekday is different: a stale one would silently hide the task if the
    // frequency ever came back to weekly, so the invariant "weekday set implies
    // weekly" is enforced here rather than trusted to the form.
    this.taskRepo.update({
      ...task,
      title: task.title.trim(),
      weekday: task.frequency === 'weekly' ? task.weekday : undefined,
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Takes a task in or out of the routine. Deliberately NOT part of `isDueOn`:
   * the tasks page has to keep listing an inactive task, or there would be no
   * way back from the state -- only the home page filters on it.
   */
  setActive(id: string, active: boolean): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }
    if (task.active === active) return { success: true }

    this.taskRepo.update({ ...task, active, updatedAt: new Date() })
    return { success: true }
  }

  delete(id: string): UseCaseResult {
    if (!this.taskRepo.getById(id)) return { success: false, error: 'Tarefa nao encontrada.' }
    this.taskRepo.delete(id)
    return { success: true }
  }

  /**
   * How many times the task has been checked off in the period containing
   * `referenceDate`. The key is stored once per check-off, so this is a count of
   * occurrences rather than a tally the app has to keep in step with the clock.
   */
  completionCountFor(task: Task, referenceDate: Date = new Date()): number {
    const key = periodKey(task.frequency, referenceDate)
    return task.completions.filter((completion) => completion.key === key).length
  }

  /**
   * Whether the period containing `referenceDate` is fully checked off.
   *
   * `>=`, not `===`: lowering `timesPerPeriod` on a task with more check-offs
   * already recorded must leave the period done, not permanently overdone.
   */
  isCompletedFor(task: Task, referenceDate: Date = new Date()): boolean {
    return this.completionCountFor(task, referenceDate) >= task.timesPerPeriod
  }

  /**
   * Check-level progress across a set of tasks for the period containing
   * `referenceDate`: every required check-off counts on its own, so a task at
   * three of eight contributes three rather than nothing until it is finished.
   * This is what the meters read, and it is the model's own question -- both
   * list pages ask it, and a tally computed twice is a tally that can drift.
   *
   * Done is clamped per task: lowering `timesPerPeriod` can leave more
   * check-offs recorded than the target asks for, and an over-full task must not
   * lend credit to the ones beside it.
   */
  checkTally(tasks: Task[], referenceDate: Date = new Date()): CheckTally {
    return tasks.reduce<CheckTally>(
      (tally, task) => ({
        done:
          tally.done + Math.min(this.completionCountFor(task, referenceDate), task.timesPerPeriod),
        total: tally.total + task.timesPerPeriod,
      }),
      { done: 0, total: 0 },
    )
  }

  /**
   * Records one check-off for the period containing `referenceDate`, or clears
   * the period when it is already full.
   *
   * The wrap is what keeps a once-a-period task a plain toggle: 0 -> 1 -> 0. For
   * a task needing several it is the coarse undo, starting the period over;
   * `undoCompletion` takes back a single check. Keyed on the period rather than
   * a flag, so rollover into the next period is derived rather than written and
   * repeated clicks cannot corrupt the state.
   */
  advanceCompletion(id: string, referenceDate: Date = new Date()): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }

    const key = periodKey(task.frequency, referenceDate)

    // Writing a future key would break the "rollover is derived, never written"
    // invariant: the task would silently read as already done once that period
    // arrives. Comparing keys lexicographically is safe because both are in the
    // same frequency's zero-padded format, where lexicographic order is
    // chronological -- including across ISO week-years (2025-W52 < 2026-W01).
    if (key > periodKey(task.frequency, new Date())) {
      return { success: false, error: 'Nao e possivel concluir um periodo futuro.' }
    }

    const count = this.isCompletedFor(task, referenceDate)
      ? 0
      : this.completionCountFor(task, referenceDate) + 1

    this.taskRepo.update({
      ...task,
      completions: this.withCount(task.completions, key, count),
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Writes an exact number of check-offs for the period, which is what tapping a
   * cell on the gauge means: "I am at four of eight". Clamped rather than
   * refused, so a gauge rendered from a stale count cannot write past the target.
   */
  setCompletionCount(id: string, count: number, referenceDate: Date = new Date()): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }

    const key = periodKey(task.frequency, referenceDate)
    if (key > periodKey(task.frequency, new Date())) {
      return { success: false, error: 'Nao e possivel concluir um periodo futuro.' }
    }

    const clamped = Math.min(Math.max(Math.trunc(count), 0), task.timesPerPeriod)
    if (clamped === this.completionCountFor(task, referenceDate)) return { success: true }

    this.taskRepo.update({
      ...task,
      completions: this.withCount(task.completions, key, clamped),
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Takes back a single check-off in the period containing `referenceDate`.
   *
   * Nothing to undo is a success, not an error: the control is disabled at zero,
   * so reaching here means a stale render, and a toast about it would be noise.
   * Which occurrence is dropped does not matter -- they are the same string.
   */
  undoCompletion(id: string, referenceDate: Date = new Date()): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }

    const count = this.completionCountFor(task, referenceDate)
    if (count === 0) return { success: true }

    this.taskRepo.update({
      ...task,
      completions: this.withCount(
        task.completions,
        periodKey(task.frequency, referenceDate),
        count - 1,
      ),
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Rewrites the period to hold exactly `count` copies of `key`, enforcing the
   * retention cap by dropping the oldest OTHER keys.
   *
   * Pruning the plain tail instead would drop the array minimum -- which is the
   * key just written whenever the user checks off a period older than everything
   * stored. That silently swallowed the write and re-rendered the box unchecked.
   *
   * Duplicates are the point: the sort keeps them adjacent, so the array stays
   * chronological. `count` is bounded by MAX_TIMES_PER_PERIOD, far below the cap,
   * so the slice length can never reach zero and swallow the prune.
   */
  private withCount(completions: Completion[], key: string, count: number): Completion[] {
    // Kept entries keep their original moment; only the surplus is new. Slicing
    // from the FRONT is what makes undo take back the most recent check rather
    // than the first one, which would rewrite history the user can see.
    const mine = completions.filter((completion) => completion.key === key).slice(0, count)
    const now = new Date()
    while (mine.length < count) mine.push({ key, at: now })

    const others = completions
      .filter((completion) => completion.key !== key)
      .sort(byKey)
      .slice(-(MAX_COMPLETIONS - count))

    // A stable sort by key alone, so entries within one period keep the order
    // they were recorded in -- which is chronological.
    return [...others, ...mine].sort(byKey)
  }

  /**
   * The task's check-offs grouped into the periods they belong to, most recent
   * first. Grouping lives here rather than in the view because "which period is
   * this check-off part of" is the completion model's own question.
   *
   * Periods are ordered by their latest recorded moment, falling back to the key:
   * a frequency change leaves keys of several formats behind, and those do not
   * sort chronologically against each other.
   */
  completionHistory(task: Task): CompletionPeriod[] {
    const periods = new Map<string, Completion[]>()
    for (const completion of task.completions) {
      const entries = periods.get(completion.key)
      if (entries) entries.push(completion)
      else periods.set(completion.key, [completion])
    }

    return [...periods]
      .map(([key, entries]) => ({
        key,
        entries,
        latest: Math.max(0, ...entries.map((entry) => entry.at?.getTime() ?? 0)),
      }))
      .sort((a, b) => b.latest - a.latest || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  }

  /**
   * Whether the task already existed in the period containing `referenceDate`.
   *
   * Browsing back to a month before a task was created would otherwise show it
   * as not done, counting work that was impossible against that period.
   */
  existsIn(task: Task, referenceDate: Date = new Date()): boolean {
    // A one-off's key carries no date, so it cannot answer "did this exist yet".
    // Its existence is a plain calendar comparison instead; without this, a task
    // created today would show up while browsing last month.
    if (task.frequency === 'once') {
      return periodKey('daily', task.createdAt) <= periodKey('daily', referenceDate)
    }
    return periodKey(task.frequency, task.createdAt) <= periodKey(task.frequency, referenceDate)
  }

  /**
   * The weekday gate on its own: a weekly task pinned to a weekday does not show
   * before that day of the week.
   *
   * Gating on `frequency` here too means a legacy or hand-edited document
   * carrying a weekday on a non-weekly task still behaves correctly, rather than
   * relying on the write path having always been clean.
   */
  private appearsOn(task: Task, referenceDate: Date): boolean {
    if (task.frequency !== 'weekly' || task.weekday === undefined) return true
    return isoWeekday(referenceDate) >= task.weekday
  }

  /**
   * The single predicate the views filter by: the task existed then, and its
   * weekday (if any) has come up.
   */
  isDueOn(task: Task, referenceDate: Date = new Date()): boolean {
    return this.existsIn(task, referenceDate) && this.appearsOn(task, referenceDate)
  }

  /**
   * Past its weekday within the same week and still not done, so it can still be
   * caught up. Note a Sunday task can never be late -- there is no day after
   * Sunday in an ISO week.
   */
  isLateOn(task: Task, referenceDate: Date = new Date()): boolean {
    if (task.frequency !== 'weekly' || task.weekday === undefined) return false
    if (isoWeekday(referenceDate) <= task.weekday) return false
    if (this.isCompletedFor(task, referenceDate)) return false

    // 'Atrasada' is a claim about the past. Browsing forward inside the current
    // week must not make a day that has not happened look overdue.
    if (referenceDate > new Date()) return false

    // `existsIn` compares period keys, so a weekly task created on Friday
    // "existed" from Monday of that week. Without this a task seconds old would
    // be overdue for a due day that predates it.
    const createdThisWeek =
      periodKey('weekly', task.createdAt) === periodKey('weekly', referenceDate)
    if (createdThisWeek && isoWeekday(task.createdAt) > task.weekday) return false

    return true
  }

  /** Active tasks due in the period containing `referenceDate` and still open. */
  pendingFor(referenceDate: Date = new Date()): Task[] {
    return this.taskRepo
      .getAll()
      .filter((task) => task.active)
      .filter((task) => this.isDueOn(task, referenceDate))
      .filter((task) => !this.isCompletedFor(task, referenceDate))
  }
}
