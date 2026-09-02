import type { CreateTaskInput, Task } from '@/entities'
import { createTask, periodKey } from '@/entities'
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

    this.taskRepo.create(createTask({ ...input, title: input.title.trim() }))
    return { success: true }
  }

  update(task: Task): UseCaseResult {
    const error = validateRequiredText(task.title, 'Titulo')
    if (error) return { success: false, error }

    // Changing the frequency leaves the old period keys in place. They can never
    // match a lookup in the new format, so the task correctly shows as pending,
    // and keeping them costs nothing while preserving the history.
    this.taskRepo.update({ ...task, title: task.title.trim(), updatedAt: new Date() })
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

  /** Tasks still open for the period containing `referenceDate`. */
  pendingFor(referenceDate: Date = new Date()): Task[] {
    return this.taskRepo.getAll().filter((task) => !this.isCompletedFor(task, referenceDate))
  }
}
