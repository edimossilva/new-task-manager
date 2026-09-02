/**
 * Category colours are stored as ink NAMES, not hex.
 *
 * The reference app stores a raw hex per category, which pins the data to one
 * palette -- retuning the theme would leave every saved colour behind. A name
 * resolves through CSS custom properties instead, so the palette can move
 * without touching a single document.
 */
export type CategoryInk = 'flare' | 'ultra' | 'moss' | 'ochre' | 'plum' | 'clay' | 'teal' | 'ink'

export const CATEGORY_INKS: CategoryInk[] = [
  'flare',
  'ultra',
  'moss',
  'ochre',
  'plum',
  'clay',
  'teal',
  'ink',
]

export const CATEGORY_INK_LABELS: Record<CategoryInk, string> = {
  flare: 'Laranja',
  ultra: 'Azul',
  moss: 'Verde',
  ochre: 'Ocre',
  plum: 'Roxo',
  clay: 'Terracota',
  teal: 'Petroleo',
  ink: 'Preto',
}

export const DEFAULT_CATEGORY_INK: CategoryInk = 'ultra'

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

export function isCategoryInk(value: unknown): value is CategoryInk {
  return typeof value === 'string' && (CATEGORY_INKS as string[]).includes(value)
}
