import type { Task, TaskFrequency } from '@/entities'
import type { Repository } from './repository'

export interface TaskRepository extends Repository<Task> {
  getByFrequency(frequency: TaskFrequency): Task[]
  getByCategoryId(categoryId: string): Task[]
  /** The steps filed under a task. The same reverse lookup `getByCategoryId` is. */
  getByParentId(parentId: string): Task[]
}
