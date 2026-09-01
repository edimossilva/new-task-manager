import type { TaskRepository } from '@/usecases/ports'
import { LocalStorageTaskRepository } from './local-storage-task-repository'

let taskRepo: LocalStorageTaskRepository | null = null

/**
 * Builds the repositories for one Google account. `userId` is the account's
 * `sub` claim, which namespaces the storage keys: signing in as a different
 * account on the same browser transparently opens a different dataset.
 *
 * Synchronous, unlike a network-backed provider would be. See
 * LocalStorageRepository.
 */
export function initializeRepositories(userId: string): void {
  taskRepo = new LocalStorageTaskRepository(userId)
  taskRepo.initialize()
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
