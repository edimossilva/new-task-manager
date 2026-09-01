import type { Task, TaskFrequency } from '@/entities'
import type { TaskRepository } from '@/usecases/ports'
import { LocalStorageRepository, type StoredRecord } from './local-storage-repository'

function serialize(task: Task): StoredRecord {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    frequency: task.frequency,
    completions: task.completions,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }
}

function deserialize(data: StoredRecord): Task {
  return {
    id: data.id as string,
    title: data.title as string,
    description: (data.description as string | null) ?? undefined,
    frequency: data.frequency as TaskFrequency,
    completions: (data.completions as string[] | undefined) ?? [],
    createdAt: new Date(data.createdAt as string),
    updatedAt: new Date(data.updatedAt as string),
  }
}

export class LocalStorageTaskRepository
  extends LocalStorageRepository<Task>
  implements TaskRepository
{
  constructor(userId: string) {
    super(userId, 'tasks', serialize, deserialize)
  }

  getByFrequency(frequency: TaskFrequency): Task[] {
    return this.getAll().filter((task) => task.frequency === frequency)
  }
}
