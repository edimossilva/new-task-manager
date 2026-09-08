import { Timestamp, type DocumentData, type Firestore } from 'firebase/firestore'
import type { Task, TaskFrequency, Weekday } from '@/entities'
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
    completions: task.completions,
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
    completions: (data.completions as string[] | undefined) ?? [],
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
