import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { InkName, ThemeName } from '@/entities'
import {
  APPEARANCE_ID,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  INKS,
  THEMES,
  createAppearance,
} from '@/entities'
import { getAppearanceRepository } from '@/adapters/repositories'

/**
 * Writes the chosen ink onto :root, where every `--color-accent*` utility in the
 * app resolves it. One assignment retints the whole interface.
 *
 * `--color-accent-text` is NOT set here: each theme points it at either
 * `bright` or `deep`, so the light theme darkens the accent for text while the
 * four dark ones lighten it.
 */
function paintAccent(accent: InkName): void {
  const ink = INKS[accent]
  const root = document.documentElement.style
  root.setProperty('--color-accent', ink.base)
  root.setProperty('--color-accent-bright', ink.bright)
  root.setProperty('--color-accent-deep', ink.deep)
  root.setProperty('--color-accent-dim', ink.dim)
}

function paintTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
  // Keeps the mobile browser chrome in step with the ground.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEMES[theme].swatch[0])
}

export const useAppearanceStore = defineStore('appearance', () => {
  const accent = ref<InkName>(DEFAULT_ACCENT)
  const theme = ref<ThemeName>(DEFAULT_THEME)

  const ink = computed(() => INKS[accent.value])
  const themeInfo = computed(() => THEMES[theme.value])

  // Painting on change rather than inside the setters covers the load path too.
  watch(accent, paintAccent, { immediate: true })
  watch(theme, paintTheme, { immediate: true })

  /**
   * Called from setupSession after the repositories initialize, which is before
   * the app mounts -- so the theme and accent are already applied on the first
   * paint and there is no flash of the defaults.
   */
  function load(): void {
    const stored = getAppearanceRepository().getById(APPEARANCE_ID)
    accent.value = stored?.accent ?? DEFAULT_ACCENT
    theme.value = stored?.theme ?? DEFAULT_THEME
  }

  function persist(): void {
    const repo = getAppearanceRepository()
    const existing = repo.getById(APPEARANCE_ID)
    // Upsert: the document does not exist until the first choice is made.
    if (existing) {
      repo.update({ ...existing, accent: accent.value, theme: theme.value })
    } else {
      repo.create(createAppearance(accent.value, theme.value))
    }
  }

  function setAccent(next: InkName): void {
    accent.value = next
    persist()
  }

  function setTheme(next: ThemeName): void {
    theme.value = next
    persist()
  }

  function reset(): void {
    accent.value = DEFAULT_ACCENT
    theme.value = DEFAULT_THEME
  }

  return { accent, theme, ink, themeInfo, load, setAccent, setTheme, reset }
})
