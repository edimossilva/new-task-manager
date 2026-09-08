import { Timestamp, type DocumentData, type Firestore } from 'firebase/firestore'
import type { Completion, Task, TaskFrequency, Weekday } from '@/entities'
import { normalizeTimesPerPeriod } from '@/entities'
import type { TaskRepository } from '@/usecases/ports'
import { FirestoreRepository } from './firestore-repository'

function serialize(task: Task): DocumentData {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    frequency: task.frequency,
    categoryId: task.categoryId ?? null,
    weekday: task.weekday ?? null,
    timesPerPeriod: task.timesPerPeriod,
    active: task.active,
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
  return {
    id: data.id as string,
    title: data.title as string,
    description: (data.description as string | null) ?? undefined,
    frequency: data.frequency as TaskFrequency,
    categoryId: (data.categoryId as string | null) ?? undefined,
    weekday: toWeekday(data.weekday),
    // Missing on every task written before the feature, and the normalizer
    // turns that absence into the 1 those tasks have always meant.
    timesPerPeriod: normalizeTimesPerPeriod(data.timesPerPeriod),
    // Only an explicit `false` deactivates: every task written before the flag
    // existed was part of the routine, and a missing field must not hide it.
    active: data.active !== false,
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
}
