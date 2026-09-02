import { computed } from 'vue'
import { isSameDay } from '@/entities'
import { usePeriodStore } from '@/stores/period-store'

/**
 * Reads the period the views should render. No lifecycle hooks, so it is safe to
 * call from any number of components -- the clock itself lives in the store.
 */
export function usePeriodSelection() {
  const store = usePeriodStore()

  const referenceDate = computed(() => {
    const selection = store.selection
    // A ternary rather than `??` on purpose: with a selection pinned this branch
    // never reads `store.now`, so it never subscribes to it and the 60s tick
    // cannot drag the view back to today. Clearing it re-subscribes.
    return selection ? new Date(selection.year, selection.month - 1, selection.day, 12) : store.now
  })

  /** The real today. Labels like 'Hoje' must compare against this, not the browsed date. */
  const today = computed(() => store.now)

  const isToday = computed(() => isSameDay(referenceDate.value, store.now))

  return { referenceDate, today, isToday }
}
