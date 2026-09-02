import type { InkName } from './palette'
import { DEFAULT_ACCENT, INK_NAMES } from './palette'

/**
 * Appearance lives as a single document so it rides the existing generic
 * repository (which is collection-shaped) without new machinery.
 */
export const APPEARANCE_ID = 'appearance'

export interface Appearance {
  id: string
  accent: InkName
}

/**
 * Every ink except `ink` itself.
 *
 * A black accent is degenerate: the accent's whole job is to separate "now"
 * from ordinary ink, and `text-accent` sitting on `bg-ink` would vanish
 * outright on the selected-and-today chip.
 */
export const ACCENT_CHOICES: InkName[] = INK_NAMES.filter((name) => name !== 'ink')

export function createAppearance(accent: InkName = DEFAULT_ACCENT): Appearance {
  return { id: APPEARANCE_ID, accent }
}
