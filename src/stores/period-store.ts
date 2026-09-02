import { ref } from 'vue'
import { defineStore } from 'pinia'
import { daysInMonth } from '@/entities'

const REFRESH_MS = 60_000

interface DateParts {
  year: number
  month: number // 1-based, matching the period-key format
  day: number
}

function partsOf(date: Date): DateParts {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

function clampDay(parts: DateParts): DateParts {
  return { ...parts, day: Math.min(parts.day, daysInMonth(parts.year, parts.month)) }
}

/**
 * The app's clock and the period the user is looking at.
 *
 * `now` keeps up with the wall clock so period-derived computeds re-evaluate
 * when the day, week, month or year rolls over -- a tab left open overnight
 * would otherwise still show yesterday's check-offs as current.
 *
 * It lives here rather than in a composable because a composable's `onMounted`
 * gives every caller its own interval and its own `now` ref. Two refs sampled
 * either side of midnight would have the selector and the view disagree about
 * what day it is. A Pinia setup store runs in an effect scope that lasts as long
 * as the app, so there is exactly one interval and it needs no teardown.
 */
export const usePeriodStore = defineStore('period', () => {
  const now = ref(new Date())

  // null = follow the clock. Parts = the user pinned a specific day.
  const selection = ref<DateParts | null>(null)

  function refresh() {
    now.value = new Date()
  }

  setInterval(refresh, REFRESH_MS)
  // Catches the common case: the tab was hidden across the boundary.
  document.addEventListener('visibilitychange', refresh)

  /** Materializes the full triple before editing one field of it. */
  function current(): DateParts {
    return selection.value ?? partsOf(now.value)
  }

  function setYear(year: number): void {
    selection.value = clampDay({ ...current(), year })
  }

  function setMonth(month: number): void {
    selection.value = clampDay({ ...current(), month })
  }

  function setDay(day: number): void {
    selection.value = clampDay({ ...current(), day })
  }

  /** Back to following the clock. Must be null, not today's parts. */
  function clear(): void {
    selection.value = null
  }

  return { now, selection, setYear, setMonth, setDay, clear }
})
