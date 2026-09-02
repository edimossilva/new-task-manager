import type { CreateTaskInput, Task } from '@/entities'
import { createTask, isoWeekday, periodKey } from '@/entities'
import type { TaskRepository } from './ports'
import { validateRequiredText } from './validation'

export interface UseCaseResult {
  success: boolean
  error?: string
}

/**
 * Retention cap for `completions`: ten years of daily check-offs. At ~11 bytes a
 * key that is ~40 KB, comfortably inside Firestore's 1 MiB per-document limit,
 * and it keeps retention from being something the UI has to be tuned around.
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
    const error = validateRequiredText(input.title, 'Titulo')
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
    const error = validateRequiredText(task.title, 'Titulo')
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

  delete(id: string): UseCaseResult {
    if (!this.taskRepo.getById(id)) return { success: false, error: 'Tarefa nao encontrada.' }
    this.taskRepo.delete(id)
    return { success: true }
  }

  /** Whether the task is already checked off for the period containing `referenceDate`. */
  isCompletedFor(task: Task, referenceDate: Date = new Date()): boolean {
    return task.completions.includes(periodKey(task.frequency, referenceDate))
  }

  /**
   * Checks the task off for the current period, or clears it if already checked.
   * Keyed on the period rather than a flag, so rollover into the next period is
   * derived rather than written and repeated clicks cannot corrupt the state.
   */
  toggleCompletion(id: string, referenceDate: Date = new Date()): UseCaseResult {
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

    const completions = task.completions.includes(key)
      ? task.completions.filter((completion) => completion !== key)
      : this.withCompletion(task.completions, key)

    this.taskRepo.update({ ...task, completions, updatedAt: new Date() })
    return { success: true }
  }

  /**
   * Adds `key` and enforces the retention cap by dropping the oldest OTHER keys.
   *
   * Pruning the plain tail instead would drop the array minimum -- which is the
   * key just written whenever the user checks off a period older than everything
   * stored. That silently swallowed the write and re-rendered the box unchecked.
   */
  private withCompletion(completions: string[], key: string): string[] {
    const others = [...completions].sort().slice(-(MAX_COMPLETIONS - 1))
    return [...others, key].sort()
  }

  /**
   * Whether the task already existed in the period containing `referenceDate`.
   *
   * Browsing back to a month before a task was created would otherwise show it
   * as not done, counting work that was impossible against that period.
   */
  existsIn(task: Task, referenceDate: Date = new Date()): boolean {
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

  /** Tasks due in the period containing `referenceDate` and still open. */
  pendingFor(referenceDate: Date = new Date()): Task[] {
    return this.taskRepo
      .getAll()
      .filter((task) => this.isDueOn(task, referenceDate))
      .filter((task) => !this.isCompletedFor(task, referenceDate))
  }
}
