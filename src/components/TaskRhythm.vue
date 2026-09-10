<script setup lang="ts">
import { computed } from 'vue'
import { WEEKDAYS, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/entities'

const props = defineProps<{
  /** Check-offs per weekday, Monday first. */
  byWeekday: number[]
  /** Check-offs per hour, 0..23. Only the ones carrying a moment can say. */
  byHour: number[]
  /** How many check-offs carry a moment at all. */
  dated: number
}>()

const CENTER = 100
/** Where the spokes start: outside the hub, which has the peak hour in it. */
const HUB = 36
/** The longest a spoke can reach. The dashed ring sits four units past it. */
const REACH = 48

const weekdayMax = computed(() => Math.max(1, ...props.byWeekday))
const hourMax = computed(() => Math.max(0, ...props.byHour))

/** Hour 0 at the top, running clockwise, like every dial ever built. */
function point(hour: number, radius: number) {
  const angle = ((hour * 15 - 90) * Math.PI) / 180
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  }
}

/**
 * The hour that carries the most check-offs. A dial with a peak reads as a
 * habit with a time of day; one without reads as noise, which is itself worth
 * seeing.
 */
const peakHour = computed(() => {
  if (hourMax.value === 0) return null
  return props.byHour.indexOf(hourMax.value)
})

/**
 * Twenty-four spokes, always. The empty ones are drawn as stubs rather than
 * dropped: a dial missing half its spokes reads as a broken instrument, while
 * a dial of short ones reads as an hour nothing happens in.
 */
const spokes = computed(() =>
  props.byHour.map((count, hour) => {
    const length = hourMax.value === 0 ? 0 : (count / hourMax.value) * REACH
    const inner = point(hour, HUB)
    const outer = point(hour, HUB + Math.max(length, 0))
    return { hour, count, length, inner, outer, isPeak: hour === peakHour.value }
  }),
)

/** 00 / 06 / 12 / 18 -- the quarters. Twenty-four labels would be a smudge. */
const quarters = computed(() =>
  [0, 6, 12, 18].map((hour) => ({
    hour,
    label: String(hour).padStart(2, '0'),
    ...point(hour, 96),
  })),
)
</script>

<template>
  <div class="rhythm">
    <!-- WHICH DAY: seven columns, always, so the week keeps its shape. -->
    <section class="panel">
      <p class="panel-label">Por dia da semana</p>
      <ol class="days">
        <li
          v-for="(weekday, index) in WEEKDAYS"
          :key="weekday"
          class="day"
          :style="{ '--i': index }"
        >
          <span class="day-count figure">{{ byWeekday[index] || '' }}</span>
          <span class="day-track" :title="`${WEEKDAY_LABELS[weekday]}: ${byWeekday[index] ?? 0}`">
            <span
              class="day-fill"
              :style="{ height: `${((byWeekday[index] ?? 0) / weekdayMax) * 100}%` }"
            ></span>
          </span>
          <span class="day-label">{{ WEEKDAY_SHORT[weekday] }}</span>
        </li>
      </ol>
    </section>

    <!-- WHICH HOUR: the same question one resolution finer, and the only shape
         in the app that is not a bar -- a day is a circle, so the readout is. -->
    <section class="panel">
      <p class="panel-label">Por hora do dia</p>
      <div class="dial-wrap">
        <svg class="dial" viewBox="0 0 200 200" role="img" aria-label="Marcacoes por hora do dia">
          <circle class="ring" :cx="CENTER" :cy="CENTER" :r="HUB + REACH + 4" />
          <circle class="hub" :cx="CENTER" :cy="CENTER" :r="HUB - 5" />

          <!-- The scale itself: a stub per hour, under everything. -->
          <line
            v-for="spoke in spokes"
            :key="`tick-${spoke.hour}`"
            class="tick"
            :x1="spoke.inner.x"
            :y1="spoke.inner.y"
            :x2="point(spoke.hour, HUB + 4).x"
            :y2="point(spoke.hour, HUB + 4).y"
          />

          <line
            v-for="spoke in spokes"
            v-show="spoke.length > 0"
            :key="spoke.hour"
            class="spoke"
            :class="{ peak: spoke.isPeak }"
            :style="{ '--i': spoke.hour }"
            :x1="spoke.inner.x"
            :y1="spoke.inner.y"
            :x2="spoke.outer.x"
            :y2="spoke.outer.y"
            pathLength="1"
          >
            <title>{{ String(spoke.hour).padStart(2, '0') }}h: {{ spoke.count }}</title>
          </line>

          <text
            v-for="quarter in quarters"
            :key="quarter.hour"
            class="quarter"
            :x="quarter.x"
            :y="quarter.y"
          >
            {{ quarter.label }}
          </text>

          <text v-if="peakHour !== null" class="peak-figure" :x="CENTER" :y="CENTER - 4">
            {{ String(peakHour).padStart(2, '0') }}h
          </text>
          <text v-else class="peak-figure faint" :x="CENTER" :y="CENTER - 4">--</text>
          <text class="peak-label" :x="CENTER" :y="CENTER + 16">PICO</text>
        </svg>
      </div>
      <p class="panel-foot figure">
        <template v-if="dated > 0">{{ dated }} com horario</template>
        <template v-else>Sem horario registrado</template>
      </p>
    </section>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.rhythm {
  @apply grid gap-5 sm:grid-cols-[1fr_auto] sm:gap-6 sm:items-center;
}

.panel-label {
  @apply mb-2 font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em] text-fg-faint;
}

.days {
  @apply grid grid-cols-7 gap-1.5 items-end;
}

.day {
  @apply flex flex-col items-center gap-1;
}

.day-count {
  @apply h-3 text-[0.625rem] leading-3 text-fg-soft;
}

.day-track {
  @apply relative flex w-full h-16 items-end border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
  border-radius: 1px;
}

.day-fill {
  @apply w-full;
  background: var(--color-done);
  transform-origin: bottom;
  animation: rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i) * 40ms);
  transition: height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.day-label {
  @apply font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-fg-faint;
}

.dial-wrap {
  @apply mx-auto w-[196px] max-w-full;
}

.dial {
  @apply block w-full h-auto overflow-visible;
}

.ring {
  fill: none;
  stroke: var(--color-line-strong);
  stroke-width: 1;
  stroke-dasharray: 2 4;
}

.hub {
  fill: none;
  stroke: var(--color-line);
  stroke-width: 1;
}

.tick {
  stroke: var(--color-line-strong);
  stroke-width: 1;
}

/* Drawn outward from the hub: the dial fills itself in as the page arrives. */
.spoke {
  stroke: var(--color-done);
  stroke-width: 5.5;
  stroke-linecap: round;
  stroke-dasharray: 1;
  animation: sweep 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i) * 18ms);
}

/* The hour this task belongs to, in the user's own accent. */
.spoke.peak {
  stroke: var(--color-accent);
  filter: drop-shadow(0 0 4px var(--color-accent-dim));
}

.quarter {
  fill: var(--color-fg-faint);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-anchor: middle;
  dominant-baseline: middle;
}

.peak-figure {
  fill: var(--color-fg);
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 600;
  text-anchor: middle;
  dominant-baseline: middle;
}

.peak-figure.faint {
  fill: var(--color-fg-faint);
}

.peak-label {
  fill: var(--color-fg-faint);
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.22em;
  text-anchor: middle;
  dominant-baseline: middle;
}

.panel-foot {
  @apply mt-2 text-center text-[0.625rem] uppercase tracking-[0.1em] text-fg-faint;
}

@keyframes rise {
  from {
    transform: scaleY(0);
  }
}

@keyframes sweep {
  from {
    stroke-dashoffset: 1;
  }
}
</style>
