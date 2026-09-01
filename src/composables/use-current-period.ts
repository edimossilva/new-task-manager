import { onMounted, onUnmounted, ref } from 'vue'

const REFRESH_MS = 60_000

/**
 * A `now` ref that keeps up with the clock, so period-derived computeds
 * re-evaluate when the day, week, month or year rolls over. Without it a tab
 * left open overnight would still show yesterday's check-offs as current.
 */
export function useCurrentPeriod() {
  const now = ref(new Date())
  let timer: number | undefined

  function refresh() {
    now.value = new Date()
  }

  onMounted(() => {
    timer = window.setInterval(refresh, REFRESH_MS)
    // Catches the common case: the tab was hidden across the boundary.
    document.addEventListener('visibilitychange', refresh)
  })

  onUnmounted(() => {
    if (timer !== undefined) clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
  })

  return { now }
}
