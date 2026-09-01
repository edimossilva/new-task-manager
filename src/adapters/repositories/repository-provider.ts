import type { Firestore } from 'firebase/firestore'
import type { TaskRepository } from '@/usecases/ports'
import { FirestoreTaskRepository } from './firestore-task-repository'

let taskRepo: FirestoreTaskRepository | null = null

export async function initializeRepositories(db: Firestore, userId: string): Promise<void> {
  taskRepo = new FirestoreTaskRepository(db, userId)
  // A second repository would join this in a Promise.all, as in controle-mensal.
  await taskRepo.initialize()
}

export function clearRepositories(): void {
  taskRepo = null
}

function assertRepo<T>(repo: T | null, name: string): T {
  if (!repo) {
    throw new Error(`${name} not initialized. Call initializeRepositories() first.`)
  }
  return repo
}

export function getTaskRepository(): TaskRepository {
  return assertRepo(taskRepo, 'TaskRepository')
}
