import type { Firestore } from 'firebase/firestore'
import type { CategoryRepository, TaskRepository } from '@/usecases/ports'
import { FirestoreTaskRepository } from './firestore-task-repository'
import { FirestoreCategoryRepository } from './firestore-category-repository'

let taskRepo: FirestoreTaskRepository | null = null
let categoryRepo: FirestoreCategoryRepository | null = null

export async function initializeRepositories(db: Firestore, userId: string): Promise<void> {
  taskRepo = new FirestoreTaskRepository(db, userId)
  categoryRepo = new FirestoreCategoryRepository(db, userId)

  // One round trip's worth of latency rather than two.
  await Promise.all([taskRepo.initialize(), categoryRepo.initialize()])
}

export function clearRepositories(): void {
  taskRepo = null
  categoryRepo = null
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

export function getCategoryRepository(): CategoryRepository {
  return assertRepo(categoryRepo, 'CategoryRepository')
}
