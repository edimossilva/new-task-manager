import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { daysInMonth } from '@/entities'

const REFRESH_MS = 60_000

/** How far back the selector lets you browse. Also bounds the step arrows. */
const YEARS_BACK = 2

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

/** Noon, so a DST shift can never move the result to a different day. */
function toDate(parts: DateParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, 12)
}

function isSameDayParts(a: DateParts, b: DateParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
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

  /**
   * The browsable range. Both the year options and the step arrows read it, so
   * stepping can never land on a year the select has no option for -- which
   * would render that select blank.
   */
  const firstYear = computed(() => now.value.getFullYear() - YEARS_BACK)
  const lastYear = computed(() => now.value.getFullYear())

  function withinRange(parts: DateParts): boolean {
    return parts.year >= firstYear.value && parts.year <= lastYear.value
  }

  /** Moves the selection by whole days, rolling over months and years. */
  function step(days: number): void {
    const next = toDate(current())
    next.setDate(next.getDate() + days)
    const parts = partsOf(next)
    if (!withinRange(parts)) return

    // Landing back on today resumes following the clock rather than pinning to
    // it, so stepping away and back is a true round trip.
    selection.value = isSameDayParts(parts, partsOf(now.value)) ? null : parts
  }

  function canStep(days: number): boolean {
    const next = toDate(current())
    next.setDate(next.getDate() + days)
    return withinRange(partsOf(next))
  }

  /** Back to following the clock. Must be null, not today's parts. */
  function clear(): void {
    selection.value = null
  }

  return {
    now,
    selection,
    firstYear,
    lastYear,
    setYear,
    setMonth,
    setDay,
    step,
    canStep,
    clear,
  }
})
