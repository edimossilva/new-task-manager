/**
 * The app's ink palette: twenty risograph-plausible inks spanning the wheel,
 * plus earths and two neutrals.
 *
 * Every ink carries three values because the same colour is asked to do three
 * different jobs, and one hex cannot do all of them:
 *
 * - `base` -- fills that carry paper-coloured text on top (progress meter, the
 *   Atrasada tag). Saturated.
 * - `deep`   -- the ink as TEXT on a LIGHT ground. Darkened to stay legible: a
 *   light amber at base strength is unreadable at 11px on white.
 * - `bright` -- the ink as TEXT on a DARK ground. Lightened, because darkening
 *   for contrast only works one way: `deep` on near-black is *less* visible than
 *   base, not more. Every value clears 5:1 against the darkest theme ground.
 * - `dim`    -- a wash for tinted grounds and hover states.
 *
 * Themes pick between `deep` and `bright` through `--color-accent-text`, so a
 * component never has to know whether the current ground is light or dark.
 *
 * Ink NAMES are what get persisted, never hex, so this table can be retuned
 * without migrating a single document.
 */
export type InkName =
  | 'cherry'
  | 'flare'
  | 'amber'
  | 'ochre'
  | 'lime'
  | 'moss'
  | 'jade'
  | 'teal'
  | 'sky'
  | 'ultra'
  | 'indigo'
  | 'violet'
  | 'plum'
  | 'magenta'
  | 'rose'
  | 'rust'
  | 'clay'
  | 'sand'
  | 'slate'
  | 'ink'

export interface Ink {
  /** Portuguese, without diacritics, matching the rest of the UI. */
  label: string
  base: string
  deep: string
  bright: string
  dim: string
}

export const INKS: Record<InkName, Ink> = {
  cherry: {
    label: 'Cereja',
    base: '#e01b3d',
    deep: '#a31029',
    bright: '#e53f5c',
    dim: 'rgba(224, 27, 61, 0.12)',
  },
  flare: {
    label: 'Laranja',
    base: '#ff4d17',
    deep: '#b8330a',
    bright: '#ff4d17',
    dim: 'rgba(255, 77, 23, 0.12)',
  },
  amber: {
    label: 'Ambar',
    base: '#f0a017',
    deep: '#8a5a00',
    bright: '#f0a017',
    dim: 'rgba(240, 160, 23, 0.16)',
  },
  ochre: {
    label: 'Ocre',
    base: '#a8781a',
    deep: '#6e4e08',
    bright: '#a8781a',
    dim: 'rgba(168, 120, 26, 0.14)',
  },
  lime: {
    label: 'Limao',
    base: '#7fa81c',
    deep: '#4f6b0f',
    bright: '#7fa81c',
    dim: 'rgba(127, 168, 28, 0.15)',
  },
  moss: {
    label: 'Verde',
    base: '#4a6b3d',
    deep: '#35502a',
    bright: '#6b8660',
    dim: 'rgba(74, 107, 61, 0.13)',
  },
  jade: {
    label: 'Jade',
    base: '#16866a',
    deep: '#0d5f4b',
    bright: '#299076',
    dim: 'rgba(22, 134, 106, 0.13)',
  },
  teal: {
    label: 'Petroleo',
    base: '#1e6b68',
    deep: '#124d4b',
    bright: '#4b8986',
    dim: 'rgba(30, 107, 104, 0.13)',
  },
  sky: {
    label: 'Ceu',
    base: '#2a8fc4',
    deep: '#1a6690',
    bright: '#2a8fc4',
    dim: 'rgba(42, 143, 196, 0.14)',
  },
  ultra: {
    label: 'Azul',
    base: '#2e5aa8',
    deep: '#1e3f7a',
    bright: '#6082bd',
    dim: 'rgba(46, 90, 168, 0.12)',
  },
  indigo: {
    label: 'Indigo',
    base: '#3b3f9e',
    deep: '#282b72',
    bright: '#7679bb',
    dim: 'rgba(59, 63, 158, 0.12)',
  },
  violet: {
    label: 'Violeta',
    base: '#6a44c4',
    deep: '#4a2c93',
    bright: '#8b6dd1',
    dim: 'rgba(106, 68, 196, 0.12)',
  },
  plum: {
    label: 'Roxo',
    base: '#7a4a8c',
    deep: '#573064',
    bright: '#9772a5',
    dim: 'rgba(122, 74, 140, 0.13)',
  },
  magenta: {
    label: 'Magenta',
    base: '#c42e86',
    deep: '#8e1d60',
    bright: '#cf549c',
    dim: 'rgba(196, 46, 134, 0.12)',
  },
  rose: {
    label: 'Rosa',
    base: '#e0537a',
    deep: '#a52f52',
    bright: '#e0537a',
    dim: 'rgba(224, 83, 122, 0.13)',
  },
  rust: {
    label: 'Ferrugem',
    base: '#a8452a',
    deep: '#7a2e19',
    bright: '#b96a55',
    dim: 'rgba(168, 69, 42, 0.12)',
  },
  clay: {
    label: 'Terracota',
    base: '#a8553a',
    deep: '#7a3826',
    bright: '#b46d56',
    dim: 'rgba(168, 85, 58, 0.13)',
  },
  sand: {
    label: 'Areia',
    base: '#9a8253',
    deep: '#6b5834',
    bright: '#9a8253',
    dim: 'rgba(154, 130, 83, 0.15)',
  },
  slate: {
    label: 'Chumbo',
    base: '#5a6570',
    deep: '#3e4750',
    bright: '#78818a',
    dim: 'rgba(90, 101, 112, 0.13)',
  },
  ink: {
    label: 'Preto',
    base: '#1b1815',
    deep: '#1b1815',
    bright: '#848281',
    dim: 'rgba(27, 24, 21, 0.1)',
  },
}

/** Wheel order, so the picker reads as a printed ink chart. */
export const INK_NAMES = Object.keys(INKS) as InkName[]

export const DEFAULT_ACCENT: InkName = 'flare'

export function isInkName(value: unknown): value is InkName {
  return typeof value === 'string' && value in INKS
}
