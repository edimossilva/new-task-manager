import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { InkName } from '@/entities'
import { APPEARANCE_ID, DEFAULT_ACCENT, INKS, createAppearance } from '@/entities'
import { getAppearanceRepository } from '@/adapters/repositories'

/**
 * Writes the chosen ink onto :root, where the `--color-accent*` utilities used
 * across the app resolve it. One assignment retints the entire interface.
 */
function paint(accent: InkName): void {
  const ink = INKS[accent]
  const root = document.documentElement.style
  root.setProperty('--color-accent', ink.base)
  root.setProperty('--color-accent-deep', ink.deep)
  root.setProperty('--color-accent-dim', ink.dim)
}

export const useAppearanceStore = defineStore('appearance', () => {
  const accent = ref<InkName>(DEFAULT_ACCENT)

  const ink = computed(() => INKS[accent.value])

  // Painting on change rather than inside setAccent covers the load path too.
  watch(accent, paint, { immediate: true })

  /**
   * Called after the repositories initialize, which is before the app mounts --
   * so the accent is already applied on first paint and there is no flash of
   * the default colour.
   */
  function load(): void {
    const stored = getAppearanceRepository().getById(APPEARANCE_ID)
    accent.value = stored?.accent ?? DEFAULT_ACCENT
  }

  function setAccent(next: InkName): void {
    accent.value = next
    const repo = getAppearanceRepository()
    // Upsert: the document does not exist until the first choice is made.
    const existing = repo.getById(APPEARANCE_ID)
    if (existing) {
      repo.update({ ...existing, accent: next })
    } else {
      repo.create(createAppearance(next))
    }
  }

  function reset(): void {
    accent.value = DEFAULT_ACCENT
  }

  return { accent, ink, load, setAccent, reset }
})
