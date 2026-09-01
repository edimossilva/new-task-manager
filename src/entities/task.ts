export type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Task {
  id: string
  title: string
  description?: string
  frequency: TaskFrequency
  /** Period keys already completed, ascending. e.g. ['2026-08-31', '2026-09-01'] */
  completions: string[]
  createdAt: Date
  updatedAt: Date
}

export interface CreateTaskInput {
  title: string
  description?: string
  frequency: TaskFrequency
}

export function createTask(input: CreateTaskInput): Task {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    frequency: input.frequency,
    completions: [],
    createdAt: now,
    updatedAt: now,
  }
}
