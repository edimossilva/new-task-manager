<script setup lang="ts">
import { computed } from 'vue'
import type { PeriodPoint } from '@/usecases'

const props = defineProps<{ points: PeriodPoint[] }>()

/**
 * One scale for every bar, taken from the tallest figure in the window --
 * done or asked, whichever is larger. Shared, so the bars are comparable to
 * each other and the target rule sits at the height it actually means; a bar
 * scaled to itself would make a period of one check look like a period of ten.
 */
const scale = computed(() =>
  Math.max(1, ...props.points.map((point) => Math.max(point.count, point.target))),
)

/**
 * A bar's own target on that shared scale, or null when there is nothing to
 * mark -- no target at all, or one that would land on the top edge, where it
 * would only thicken the frame.
 *
 * Per BAR, not one rule across the plot: only the bars know the plot's own
 * height (a rule spanning the chart would be positioned against the label
 * strip too), and a target is not always the same figure twice -- the weeks
 * of a category ask for different amounts as its tasks come and go. Where it
 * IS constant, fourteen hairlines at one height read as the single dashed
 * line they mean.
 */
function notch(point: PeriodPoint): number | null {
  if (point.target === 0 || point.target >= scale.value) return null
  return (point.target / scale.value) * 100
}

/**
 * Below a dozen bars every label fits; above it they collide, so only every
 * other one is drawn -- counted BACK from the newest, which is the one the
 * reader is looking for and must always be named.
 */
function showsLabel(index: number): boolean {
  if (props.points.length <= 12) return true
  return (props.points.length - 1 - index) % 2 === 0
}

function height(point: PeriodPoint): number {
  return Math.min(100, (point.count / scale.value) * 100)
}

function state(point: PeriodPoint): string {
  if (!point.existed) return 'before'
  if (point.count >= point.target) return 'met'
  if (point.count > 0) return 'short'
  return point.isCurrent ? 'open' : 'missed'
}
</script>

<template>
  <div class="chart">
    <ol class="bars">
      <li
        v-for="(point, index) in points"
        :key="point.key"
        class="slot"
        :class="[state(point), { current: point.isCurrent }]"
        :style="{ '--i': index }"
      >
        <span class="track" :title="`${point.key}: ${point.count}/${point.target}`">
          <span class="fill" :style="{ height: `${height(point)}%` }"></span>
          <!-- A hairline, not a second bar: it is the reference the fill is
               read against, not a quantity of its own. -->
          <span
            v-if="point.existed && notch(point) !== null"
            class="notch"
            :style="{ bottom: `${notch(point)}%` }"
            aria-hidden="true"
          ></span>
        </span>
        <span class="label figure">{{ showsLabel(index) ? point.label : '' }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.chart {
  @apply relative;
}

.bars {
  @apply flex items-end gap-[3px] sm:gap-1.5;
}

.slot {
  @apply flex flex-1 min-w-0 flex-col items-center gap-1.5;
}

/* Hatched, so a period with nothing done still reads as a scale and not a hole. */
.track {
  @apply relative flex w-full h-24 items-end border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
  border-radius: 1px;
}

.fill {
  @apply w-full;
  background: var(--color-done);
  box-shadow: 0 0 10px var(--color-done-dim);
  transform-origin: bottom;
  animation: rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i) * 26ms);
  transition: height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Short of the target: washed out, so the period says it fell short before the
   figures are read. The same treatment the summary's day strip uses. */
.short .fill {
  background: color-mix(in srgb, var(--color-done) 50%, var(--color-void));
  box-shadow: none;
}

/* Nothing was asked of a period the task did not exist in yet. */
.before .track {
  @apply opacity-30;
}

/* The period still running: dashed, because it is not a verdict yet. */
.current .track {
  border-style: dashed;
  border-color: var(--color-accent);
}

.current .label {
  @apply text-accent-text;
}

.missed .track {
  border-color: color-mix(in srgb, var(--color-alarm) 28%, var(--color-line-strong));
}

.label {
  @apply h-3 text-[0.5625rem] leading-3 uppercase tracking-[0.04em] text-fg-faint
         whitespace-nowrap;
}

.notch {
  @apply absolute left-0 right-0 h-px;
  background: var(--color-fg-soft);
}

@keyframes rise {
  from {
    transform: scaleY(0);
  }
}
</style>
