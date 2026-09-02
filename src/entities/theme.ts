/**
 * Five instrument panels. Each theme is a full ground + foreground + line +
 * texture + geometry set; the accent stays orthogonal, so any of the nineteen
 * accents composes with any of the five.
 *
 * `dark` is not cosmetic metadata -- it selects which accent variant becomes
 * `--color-accent-text` (`bright` on dark grounds, `deep` on light ones).
 */
export type ThemeName = 'holo' | 'terminal' | 'blueprint' | 'alloy' | 'vapor'

export interface Theme {
  /** Portuguese, without diacritics. */
  label: string
  /** One line describing the atmosphere, shown under the picker. */
  note: string
  dark: boolean
  /** Two colours for the picker's preview tile: ground, then foreground. */
  swatch: [string, string]
}

export const THEMES: Record<ThemeName, Theme> = {
  holo: {
    label: 'Holograma',
    note: 'Vidro escuro e brilho difuso',
    dark: true,
    swatch: ['#05070d', '#7dd3fc'],
  },
  terminal: {
    label: 'Terminal',
    note: 'Fosforo verde e linhas de varredura',
    dark: true,
    swatch: ['#050705', '#7bf59a'],
  },
  blueprint: {
    label: 'Planta',
    note: 'Grade tecnica e tracos finos',
    dark: true,
    swatch: ['#071018', '#8fd4f0'],
  },
  alloy: {
    label: 'Aluminio',
    note: 'Claro, frio e preciso',
    dark: false,
    swatch: ['#eef1f5', '#0e1419'],
  },
  vapor: {
    label: 'Vapor',
    note: 'Violeta profundo e horizonte',
    dark: true,
    swatch: ['#120a1f', '#f9a8e8'],
  },
}

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]

export const DEFAULT_THEME: ThemeName = 'holo'

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && value in THEMES
}
