import { Timestamp, type DocumentData, type Firestore } from 'firebase/firestore'
import type { Task, TaskFrequency } from '@/entities'
import type { TaskRepository } from '@/usecases/ports'
import { FirestoreRepository } from './firestore-repository'

function serialize(task: Task): DocumentData {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    frequency: task.frequency,
    completions: task.completions,
    createdAt: Timestamp.fromDate(task.createdAt),
    updatedAt: Timestamp.fromDate(task.updatedAt),
  }
}

function deserialize(data: DocumentData): Task {
  return {
    id: data.id as string,
    title: data.title as string,
    description: (data.description as string | null) ?? undefined,
    frequency: data.frequency as TaskFrequency,
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
}
