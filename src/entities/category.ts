import type { InkName } from './palette'
import { DEFAULT_ACCENT, INKS, INK_NAMES, isInkName } from './palette'

/** Categories draw from the shared ink palette; all twenty are offered. */
export type CategoryInk = InkName

export const CATEGORY_INKS: CategoryInk[] = INK_NAMES

export const CATEGORY_INK_LABELS: Record<CategoryInk, string> = Object.fromEntries(
  INK_NAMES.map((name) => [name, INKS[name].label]),
) as Record<CategoryInk, string>

export const DEFAULT_CATEGORY_INK: CategoryInk = DEFAULT_ACCENT

export const isCategoryInk = isInkName

export interface Category {
  id: string
  name: string
  description?: string
  ink: CategoryInk
  createdAt: Date
  updatedAt: Date
}

export interface CreateCategoryInput {
  name: string
  description?: string
  ink: CategoryInk
}

export function createCategory(input: CreateCategoryInput): Category {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    ink: input.ink,
    createdAt: now,
    updatedAt: now,
  }
}
