import { Timestamp, type DocumentData, type Firestore } from 'firebase/firestore'
import type { Completion, Task, TaskFrequency, Weekday } from '@/entities'
import { normalizeTimesPerPeriod, normalizeTurns } from '@/entities'
import type { TaskRepository } from '@/usecases/ports'
import { FirestoreRepository } from './firestore-repository'

function serialize(task: Task): DocumentData {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    frequency: task.frequency,
    categoryId: task.categoryId ?? null,
    parentId: task.parentId ?? null,
    weekday: task.weekday ?? null,
    timesPerPeriod: task.timesPerPeriod,
    turns: task.turns,
    active: task.active,
    optional: task.optional,
    completions: task.completions.map((completion) => ({
      key: completion.key,
      at: completion.at ? Timestamp.fromDate(completion.at) : null,
    })),
    createdAt: Timestamp.fromDate(task.createdAt),
    updatedAt: Timestamp.fromDate(task.updatedAt),
  }
}

/**
 * Out-of-range values collapse to undefined. A hand-edited `weekday: 8` would
 * never satisfy the `>=` gate, leaving the task invisible and so unreachable and
 * undeletable from the UI.
 */
function toWeekday(value: unknown): Weekday | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  if (value < 1 || value > 7) return undefined
  return value as Weekday
}

/**
 * Reads both shapes. Before check-offs carried a moment, a completion WAS its
 * period key -- those documents are still out there and still correct, they just
 * cannot say when. Anything unrecognisable is dropped rather than counted.
 */
function toCompletions(value: unknown): Completion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): Completion[] => {
    if (typeof entry === 'string') return [{ key: entry }]
    if (!entry || typeof entry !== 'object') return []
    const { key, at } = entry as { key?: unknown; at?: unknown }
    if (typeof key !== 'string') return []
    return [{ key, at: at instanceof Timestamp ? at.toDate() : undefined }]
  })
}

function deserialize(data: DocumentData): Task {
  // Hoisted: the turn plan is truncated against the target, so it must be read
  // from the normalized value rather than from whatever the document holds.
  const timesPerPeriod = normalizeTimesPerPeriod(data.timesPerPeriod)
  return {
    id: data.id as string,
    title: data.title as string,
    description: (data.description as string | null) ?? undefined,
    frequency: data.frequency as TaskFrequency,
    categoryId: (data.categoryId as string | null) ?? undefined,
    // Absent on every document written before sub-tasks, which is exactly what
    // a task that stands alone looks like. No migration. A non-string is read
    // the same way rather than trusted: a task filed under a value nothing can
    // resolve is drawn as a top-level task, never dropped.
    // Its own id would be a container holding itself, which no walk terminates
    // on. Dropped on the way in, the way `toWeekday` drops an 8: this file
    // normalizes on READ so the model never has to trust the write path.
    parentId:
      typeof data.parentId === 'string' && data.parentId !== data.id ? data.parentId : undefined,
    weekday: toWeekday(data.weekday),
    // Missing on every task written before the feature, and the normalizer
    // turns that absence into the 1 those tasks have always meant.
    timesPerPeriod,
    // Same story one field down: absent on every document written before turns
    // existed, and the normalizer reads that absence as the empty plan those
    // tasks have always had. No migration.
    turns: normalizeTurns(data.turns, timesPerPeriod),
    // Only an explicit `false` deactivates: every task written before the flag
    // existed was part of the routine, and a missing field must not hide it.
    active: data.active !== false,
    // The mirror of the line above, and the default is the other way round:
    // only an explicit `true` makes a task optional, so every document written
    // before the flag reads as work the routine asks for. No migration.
    optional: data.optional === true,
    completions: toCompletions(data.completions),
    createdAt: (data.createdAt as Timestamp).toDate(),
    updatedAt: (data.updatedAt as Timestamp).toDate(),
  }
}

export class FirestoreTaskRepository extends FirestoreRepository<Task> implements TaskRepository {
  constructor(db: Firestore, userId: string) {
    super(db, userId, 'tasks', serialize, deserialize)
  }

  getByFrequency(frequency: TaskFrequency): Task[] {
    return this.getAll().filter((task) => task.frequency === frequency)
  }

  getByCategoryId(categoryId: string): Task[] {
    return this.getAll().filter((task) => task.categoryId === categoryId)
  }

  getByParentId(parentId: string): Task[] {
    return this.getAll().filter((task) => task.parentId === parentId)
  }
}
