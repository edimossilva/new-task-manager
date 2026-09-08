import { computed, type Ref } from 'vue'
import type { Category, Task } from '@/entities'
import { useCategoryStore } from '@/stores/category-store'

/** Bucket id for tasks with no category, and for ones pointing at a missing one. */
export const UNFILED = '__unfiled__'

export interface RackUnit {
  key: string
  /** Absent for the unfiled bucket, which is a real group rather than a category. */
  category?: Category
  tasks: Task[]
}

/**
 * Splits tasks into one unit per category, in name order, unfiled last.
 *
 * A plain function rather than only a composable, because the home page builds
 * one rack per frequency band and a composable cannot be called in a loop.
 *
 * The incoming order is preserved inside every unit, so whatever the caller
 * sorted by still holds row by row.
 *
 * A task whose `categoryId` points at a category that is gone falls into the
 * unfiled bucket rather than out of the page: the delete guard makes it
 * unlikely, but a task nothing renders is a task nobody can edit or delete.
 */
export function buildCategoryRack(tasks: Task[], categories: Category[]): RackUnit[] {
  const known = new Set(categories.map((category) => category.id))

  const grouped = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.categoryId && known.has(task.categoryId) ? task.categoryId : UNFILED
    const bucket = grouped.get(key)
    if (bucket) bucket.push(task)
    else grouped.set(key, [task])
  }

  const units = [...categories]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((category) => grouped.has(category.id))
    .map((category) => ({ key: category.id, category, tasks: grouped.get(category.id)! }))

  const unfiled = grouped.get(UNFILED)
  return unfiled ? [...units, { key: UNFILED, tasks: unfiled }] : units
}

/** The reactive wrapper, for a page with one rack to build. */
export function useCategoryRack(tasks: Ref<Task[]>) {
  const categoryStore = useCategoryStore()
  return computed(() => buildCategoryRack(tasks.value, categoryStore.categories))
}
