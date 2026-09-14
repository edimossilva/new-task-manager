/**
 * In-memory stands-in for the Firestore repositories.
 *
 * The harness aliases `@/adapters/repositories` to this module, so every store
 * and use case runs untouched against the fixtures instead of a signed-in
 * Firestore session. They are typed against the real PORTS rather than written
 * as loose object literals, which is the whole point of committing the harness:
 * change a port and this fails `yarn type-check` instead of rotting quietly.
 *
 * Writes mutate the arrays in place, so ticking a box in the browser behaves the
 * way it does in the app -- and resets on reload, which is what you want from a
 * preview.
 */
import type { Appearance, Category, Task, TaskFrequency } from '@/entities'
import type { AppearanceRepository, CategoryRepository, TaskRepository } from '@/usecases/ports'
import { categories, tasks } from './fixtures'

function replace<T extends { id: string }>(list: T[], entity: T): void {
  const index = list.findIndex((item) => item.id === entity.id)
  if (index >= 0) list[index] = entity
}

function remove<T extends { id: string }>(list: T[], id: string): void {
  const index = list.findIndex((item) => item.id === id)
  if (index >= 0) list.splice(index, 1)
}

const taskRepo: TaskRepository = {
  getAll: () => tasks,
  getById: (id) => tasks.find((task) => task.id === id),
  create: (task) => void tasks.push(task),
  update: (task) => replace(tasks, task),
  delete: (id) => remove(tasks, id),
  getByFrequency: (frequency: TaskFrequency) => tasks.filter((t) => t.frequency === frequency),
  getByCategoryId: (categoryId: string) => tasks.filter((t) => t.categoryId === categoryId),
}

const categoryRepo: CategoryRepository = {
  getAll: () => categories,
  getById: (id) => categories.find((category) => category.id === id),
  create: (category) => void categories.push(category),
  update: (category) => replace(categories, category),
  delete: (id) => remove(categories, id),
}

const appearances: Appearance[] = []

const appearanceRepo: AppearanceRepository = {
  getAll: () => appearances,
  getById: (id) => appearances.find((entry) => entry.id === id),
  create: (entry) => void appearances.push(entry),
  update: (entry) => replace(appearances, entry),
  delete: (id) => remove(appearances, id),
}

export function getTaskRepository(): TaskRepository {
  return taskRepo
}

export function getCategoryRepository(): CategoryRepository {
  return categoryRepo
}

export function getAppearanceRepository(): AppearanceRepository {
  return appearanceRepo
}

/** Signature-compatible with the real provider; the harness never calls it. */
export async function initializeRepositories(): Promise<void> {}

export function clearRepositories(): void {}

export type { Category, Task }
