<script setup lang="ts">
import { computed } from 'vue'
import type { Weekday } from '@/entities'
import { WEEKDAY_SHORT, formatDate, isSameDay, periodKey, weekDates } from '@/entities'
import { usePeriodStore } from '@/stores/period-store'
import { usePeriodSelection } from '@/composables/use-period-selection'

/**
 * Seven days of one ISO week as bars: the check-offs each day carried, against
 * what it asked for.
 *
 * Drawn here rather than in each page. Home reads the week to place the day it
 * is browsing inside it, the summary reads it as the week's own block, and a
 * strip drawn twice is a strip that drifts.
 */
const props = defineProps<{
  /** The week's Monday. The seven cells are built from it, never from an index. */
  monday: Date
  /** Check-offs placed on each day, Monday first. Always length 7. */
  done: number[]
  /**
   * What each day asked for, Monday first -- the DAILIES' demand and nothing
   * else, since no other cadence belongs to a single day. Drawn as the notch,
   * which is why a caller showing this strip owes its reader that caveat.
   */
  expected: number[]
  /** The day the caller is browsing, marked apart from today. */
  selected?: Date
  /** Cells become buttons that emit `select`. Off by default: the summary reads a WEEK. */
  interactive?: boolean
}>()

const emit = defineEmits<{ select: [date: Date] }>()

const periodStore = usePeriodStore()
const { today } = usePeriodSelection()

/**
 * Every bar is drawn on ONE scale -- the tallest thing in the week, done or
 * asked for -- so the seven are comparable and the target notch sits at the
 * height it means. Scaling each bar to its own day would make a 2/2 day look
 * like a 9/9 one.
 *
 * `isFuture` is a day-KEY comparison, not a timestamp one: the cells are built
 * at noon and the clock is not, so `date > now` would grey today out every
 * morning.
 */
const cells = computed(() => {
  const scale = Math.max(1, ...props.done, ...props.expected)
  const todayKey = periodKey('daily', today.value)
  return weekDates(props.monday).map((date, index) => {
    const count = props.done[index] ?? 0
    const expected = props.expected[index] ?? 0
    return {
      date,
      label: WEEKDAY_SHORT[(index + 1) as Weekday],
      done: count,
      expected,
      percent: (count / scale) * 100,
      notch: (expected / scale) * 100,
      short: expected > count,
      isToday: isSameDay(date, today.value),
      isFuture: periodKey('daily', date) > todayKey,
      isSelected: props.selected ? isSameDay(date, props.selected) : false,
      // A cell the store would refuse says so rather than doing nothing.
      enabled: periodStore.contains(date),
    }
  })
})
</script>

<template>
  <ol class="days">
    <li
      v-for="day in cells"
      :key="day.label"
      class="day"
      :class="{ today: day.isToday, ahead: day.isFuture, on: day.isSelected }"
    >
      <!--
        A button only where the page can act on a day. The summary's unit is a
        week, so there it stays a readout.
      -->
      <component
        :is="interactive ? 'button' : 'div'"
        class="day-cell"
        :title="`${day.label}: ${day.done} de ${day.expected} marcacoes`"
        v-bind="
          interactive
            ? {
                type: 'button',
                disabled: !day.enabled,
                'aria-label': `${formatDate(day.date)}: ${day.done} marcacoes`,
                'aria-current': day.isSelected ? 'date' : undefined,
                onClick: () => emit('select', day.date),
              }
            : {}
        "
      >
        <!--
          The notch is the day's own target on the shared scale: the fill
          reaching it is the whole reading, and a bar past it is a day that
          carried more than its share.
        -->
        <span class="day-bar">
          <span
            class="day-fill"
            :class="{ short: day.short }"
            :style="{ height: `${day.percent}%` }"
          ></span>
          <span
            v-if="day.expected"
            class="day-notch"
            :style="{ bottom: `max(0px, calc(${day.notch}% - 1px))` }"
            aria-hidden="true"
          ></span>
        </span>
        <span class="day-count figure">
          {{ day.done
          }}<template v-if="day.expected"><span class="slash">/</span>{{ day.expected }}</template>
        </span>
        <span class="day-label">{{ day.label }}</span>
      </component>
    </li>
  </ol>
</template>

<style scoped>
@reference "../assets/main.css";

/* Seven columns, always, so the week keeps its shape. */
.days {
  @apply grid grid-cols-7 gap-1.5 items-end;
}

.day {
  @apply min-w-0;
}

.day-cell {
  @apply flex w-full flex-col items-center gap-1;
}

button.day-cell {
  @apply cursor-pointer;
  -webkit-tap-highlight-color: transparent;
}

button.day-cell:disabled {
  @apply opacity-40 cursor-not-allowed;
}

.day-bar {
  @apply relative flex w-full h-12 items-end border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.day-fill {
  @apply w-full;
  background: var(--color-done);
  transition: height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Short of its own target: the fill says so before the figures are read. */
.day-fill.short {
  background: color-mix(in srgb, var(--color-done) 55%, var(--color-void));
}

/*
 * A hairline, not a second bar: it is the reference the fill is read against.
 *
 * Offset by its own pixel, because the tallest demand in the week IS the scale:
 * at `bottom: 100%` the line sits one pixel above the bar and the overflow clip
 * eats it, so the day that asked for the most was the one day with no notch.
 */
.day-notch {
  @apply absolute left-0 right-0 h-px;
  background: var(--color-fg);
}

.day.today .day-bar {
  @apply border-accent;
}

.day.ahead .day-bar {
  @apply opacity-40;
}

.day-count {
  @apply text-[0.6875rem] text-fg;
}

.slash {
  @apply text-fg-faint;
}

.day-label {
  @apply font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-fg-faint;
}

.day.today .day-label {
  @apply text-accent-text;
}

/*
 * The day being browsed, which is a different claim from today's -- on home
 * they are usually the same cell and must still be tellable apart. A rule under
 * the cell rather than another border: it composes with the accent frame today
 * already wears instead of arguing with it.
 */
.day.on .day-label {
  @apply text-fg font-medium;
}

.day.on .day-cell {
  @apply relative;
}

.day.on .day-cell::after {
  content: '';
  @apply absolute left-1/2 -bottom-1 h-px w-5 -translate-x-1/2;
  background: var(--color-fg);
}

button.day-cell:focus-visible {
  @apply outline-none;
}

button.day-cell:focus-visible .day-bar {
  @apply border-accent;
  box-shadow: 0 0 0 2px var(--color-accent-dim);
}

@media (hover: hover) {
  button.day-cell:not(:disabled):hover .day-bar {
    @apply border-fg-soft;
  }
}

@media (prefers-reduced-motion: reduce) {
  .day-fill {
    transition: none;
  }
}
</style>
