import type { Task, TaskFrequency } from '@/entities'
import type { Repository } from './repository'

export interface TaskRepository extends Repository<Task> {
  getByFrequency(frequency: TaskFrequency): Task[]
  getByCategoryId(categoryId: string): Task[]
}
