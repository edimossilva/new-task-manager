<script lang="ts">
/**
 * One point on the curve. The view builds these: the component knows how to
 * draw a run of periods and nothing about what a period IS, which is what lets
 * the days of a week and a run of weeks share one instrument.
 */
export interface CurvePoint {
  /** Stable key, and what the point is called under the plot: `Seg`, `W37`. */
  label: string
  done: number
  /** What the period asked for. 0 means nothing was asked, never "asked for nothing". */
  expected: number
  /** What tapping the point browses. */
  date: Date
  /** The period the clock is in: today, or this week. */
  isCurrent: boolean
  /** Not here yet. Drawn as ground, never as a figure of zero. */
  isFuture: boolean
  /** The period being browsed. Holds the readout. */
  isSelected: boolean
  /** The period store would accept it. A control that cannot act says so. */
  enabled: boolean
}
</script>

<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * A run of periods as a CURVE, with every figure printed under it.
 *
 * Home's own instrument, where the summary keeps its bars: the summary is the
 * ledger and wants each day square and countable, home wants the SHAPE of the
 * run under the period it is showing -- and then the amounts spelled out, since
 * a curve says "more than Tuesday" and never "five".
 *
 * The line stops at the last ELAPSED point. Carrying it into the periods still
 * ahead would dive to the floor and read as days of failure when nothing has
 * been asked yet.
 */
const props = defineProps<{
  points: CurvePoint[]
  /**
   * `period` -- each column stands alone: its own figure against its own shelf.
   * `cumulative` -- the columns are a RUN: `done` and `expected` are totals
   * through that day, so the targets join into one pace line climbing to the
   * week's whole demand. A daily task's period is the day, so its chart is
   * columns; a weekly one's period is the week, so its chart is a run at it.
   */
  mode?: 'period' | 'cumulative'
  /** Printed at the plot's ceiling, which in `cumulative` mode IS the goal. */
  goalLabel?: string
}>()

const cumulative = computed(() => props.mode === 'cumulative')

const emit = defineEmits<{ select: [date: Date] }>()

/** Scoped to the instance: two curves on one page must not share a gradient. */
const uid = useId()
const fillId = `curve-fill-${uid}`

/*
 * The plot is a 100x100 box stretched to whatever width the card has
 * (`preserveAspectRatio="none"`), and every stroke carries
 * `vector-effect="non-scaling-stroke"` so the distortion never reaches the ink:
 * hairlines stay hairlines and round caps stay round. Dots are zero-length
 * round-capped LINES for the same reason -- a `<circle>` in a stretched box is
 * an ellipse.
 */
const TOP = 16
const FLOOR = 84

const plot = computed(() => {
  const slot = 100 / Math.max(1, props.points.length)
  const scale = Math.max(1, ...props.points.map((point) => Math.max(point.done, point.expected)))
  const height = FLOOR - TOP

  return props.points.map((point, index) => ({
    ...point,
    index,
    // The CENTRE of the point's own column, the share the ground is ruled into,
    // so the dot, the lit field and the figures under them are one column and
    // not three things that nearly line up.
    x: (index + 0.5) * slot,
    y: FLOOR - (point.done / scale) * height,
    shelfY: FLOOR - (point.expected / scale) * height,
    met: point.expected > 0 && point.done >= point.expected,
    // A period still running is not short of anything yet. Only a period that
    // is over can have missed its shelf.
    short: point.expected > point.done && !point.isCurrent,
  }))
})

const plotted = computed(() => plot.value.filter((point) => !point.isFuture))

/**
 * The expected progress as ONE line, in `cumulative` mode only.
 *
 * It spans the WHOLE week, the days still ahead included: a pace that stopped
 * at today would say the week wants nothing more of you, which is the opposite
 * of what it is drawn to say. Where the period chart draws a shelf per column,
 * this is the same information run into a slope -- the two never appear
 * together, since a cumulative shelf is just this line with gaps in it.
 */
const pace = computed(() =>
  cumulative.value ? curve(plot.value.map((point) => ({ x: point.x, y: point.shelfY }))) : '',
)

/**
 * Cubic segments with HORIZONTAL tangents, which is what keeps the curve
 * honest: control points sharing their end's `y` cannot carry the line above or
 * below the two figures it runs between, so a quiet Tuesday between two busy
 * days never bulges into a day that never happened.
 */
function curve(points: { x: number; y: number }[]): string {
  if (!points.length) return ''
  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!
    const to = points[i]!
    const mid = (from.x + to.x) / 2
    d += ` C ${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}`
  }
  return d
}

/**
 * The run in two strokes: what is settled, and the leg into the period the
 * clock is still inside. The live leg is DASHED rather than judged -- a week
 * three days old is not a week that failed, and a solid line diving to the
 * floor on the last point says exactly that. The same reading `TaskRunChart`
 * gives the running period.
 */
const segments = computed(() => {
  const points = plotted.value
  const last = points[points.length - 1]
  if (points.length < 2 || !last?.isCurrent) return { settled: curve(points), live: '' }
  return { settled: curve(points.slice(0, -1)), live: curve(points.slice(-2)) }
})

/** The same curve closed onto the floor. A lone point still gets a column of ground. */
const area = computed(() => {
  const points = plotted.value
  if (!points.length) return ''
  const first = points[0]!
  const last = points[points.length - 1]!
  const start = points.length === 1 ? first.x - 4 : first.x
  const end = points.length === 1 ? last.x + 4 : last.x
  const body = points.length === 1 ? `M ${start} ${first.y} L ${end} ${last.y}` : curve(points)
  return `${body} L ${end} ${FLOOR} L ${start} ${FLOOR} Z`
})

/** The point holding the readout: the browsed one, or the last one with a figure. */
const marked = computed(
  () => plot.value.find((point) => point.isSelected) ?? plotted.value[plotted.value.length - 1],
)
</script>

<template>
  <div class="curve">
    <div class="plot">
      <!--
        The ground is the run's own columns. The periods still ahead are dotted
        -- the softer cousin of the meter hatch, which reads as a warning where
        this only means "not yet" -- and the elapsed ones are clear, so the plot
        says how far in it is before the curve is read.
      -->
      <div class="ground" aria-hidden="true">
        <span
          v-for="point in plot"
          :key="`g-${point.label}`"
          class="cell"
          :class="{ ahead: point.isFuture, now: point.isCurrent }"
        ></span>
      </div>

      <svg class="canvas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-done)" stop-opacity="0.55" />
            <stop offset="100%" stop-color="var(--color-done)" stop-opacity="0.04" />
          </linearGradient>
        </defs>

        <!--
          What each period asked for: a rounded shelf over its own column, never
          a line joined across them. A target belongs to its period, and joining
          them would draw a cadence nobody set.
        -->
        <path v-if="pace" class="pace" :d="pace" fill="none" vector-effect="non-scaling-stroke" />

        <g v-if="!cumulative" class="shelves">
          <line
            v-for="point in plot"
            :key="`s-${point.label}`"
            :class="{ ahead: point.isFuture, met: point.met }"
            :x1="point.x - 3.4"
            :x2="point.x + 3.4"
            :y1="point.shelfY"
            :y2="point.shelfY"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </g>

        <path v-if="area" class="area" :d="area" :fill="`url(#${fillId})`" />
        <path
          v-if="segments.settled"
          class="trace"
          :d="segments.settled"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-if="segments.live"
          class="trace live"
          :d="segments.live"
          vector-effect="non-scaling-stroke"
        />

        <!-- A bloom under the period being read, so its column carries a light
             of its own, and a slow ring on the one the clock is in. -->
        <line
          v-if="marked && !marked.isFuture"
          class="halo"
          :class="{ now: marked.isCurrent }"
          :x1="marked.x"
          :x2="marked.x"
          :y1="marked.y"
          :y2="marked.y"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />

        <g class="dots">
          <template v-for="point in plotted" :key="`d-${point.label}`">
            <!-- Two caps, not one: the ring is the period's state and the core
                 is the panel showing through, which is what makes a met target
                 a filled bubble and a short one a hollow bead. -->
            <line
              class="ring"
              :class="{ met: point.met, short: point.short, now: point.isCurrent }"
              :style="{ '--i': point.index }"
              :x1="point.x"
              :x2="point.x"
              :y1="point.y"
              :y2="point.y"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
            <line
              v-if="!point.met"
              class="core"
              :style="{ '--i': point.index }"
              :x1="point.x"
              :x2="point.x"
              :y1="point.y"
              :y2="point.y"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </g>
      </svg>

      <!-- The ceiling, named: in a run at a week's demand, the top of the plot
           is the number the week is asking for, and it should not have to be
           inferred from the head. -->
      <p v-if="goalLabel" class="goal figure">{{ goalLabel }}</p>

      <!--
        The columns sit over the plot as real buttons: one thumb-sized target
        per period, where the SVG under them is only ink.
      -->
      <div class="columns">
        <button
          v-for="point in plot"
          :key="`c-${point.label}`"
          type="button"
          class="column"
          :class="{ on: point.isSelected }"
          :disabled="!point.enabled"
          :aria-current="point.isSelected ? 'date' : undefined"
          :aria-label="`${point.label}: ${point.done} de ${point.expected} marcacoes`"
          @click="emit('select', point.date)"
        >
          <span class="column-field" aria-hidden="true"></span>
        </button>
      </div>
    </div>

    <!--
      THE AMOUNTS. A curve says "more than Tuesday" and never "five", so every
      figure is printed under its own column: what was done, over what was
      asked. This row is the reading; the plot above it is the shape.
    -->
    <ol class="scale">
      <li
        v-for="point in plot"
        :key="`n-${point.label}`"
        class="mark"
        :class="{
          on: point.isSelected,
          now: point.isCurrent,
          ahead: point.isFuture,
          met: point.met,
        }"
      >
        <!--
          Four readings, and only one of them is a number over a number. A
          period still ahead shows a dash rather than a zero -- nothing has been
          asked of it, and `0` is a figure of failure. One that asked nothing
          says so in a word.
        -->
        <p class="mark-count">
          <template v-if="point.isFuture">
            <span class="mark-rest" aria-hidden="true">&mdash;</span>
          </template>
          <template v-else-if="point.expected">
            <span class="mark-done">{{ point.done }}</span>
            <span class="mark-target figure">/{{ point.expected }}</span>
          </template>
          <template v-else-if="point.done">
            <span class="mark-done">{{ point.done }}</span>
          </template>
          <!-- Nothing asked and nothing done. A glyph rather than the word,
               because a weekly curve is mostly days like this and five copies
               of `livre` read as noise where five dots read as quiet. -->
          <span v-else class="mark-rest" aria-hidden="true">&middot;</span>
        </p>
        <p class="mark-label">{{ point.label }}</p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.curve {
  @apply select-none;
}

.plot {
  @apply relative h-[112px] overflow-hidden;
  border-radius: var(--radius-md);
  background-color: var(--color-well);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--color-fg) 8%, transparent);
}

.ground {
  @apply absolute inset-0 grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}

/*
 * Dots rather than the meter hatch: the hatch means a warning or an empty
 * gauge elsewhere in the app, and a period that simply has not arrived is
 * neither. A softer texture for a softer claim.
 */
.cell.ahead {
  background-image: radial-gradient(
    circle at center,
    color-mix(in srgb, var(--color-line-strong) 70%, transparent) 1px,
    transparent 1.2px
  );
  background-size: 7px 7px;
}

/* The period the clock is in, lit the way the running turn is lit downpage. */
.cell.now {
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-accent) 15%, transparent),
    transparent 72%
  );
}

.canvas {
  @apply absolute inset-0 w-full h-full;
  /* The curve sweeps in from the left once, on the load that earned it. */
  animation: sweep 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes sweep {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0 0 0 0);
  }
}

/*
 * The pace: where the week should be by each day, climbing to everything it
 * asks. Dashed, and never the done ink -- it is a promise, not a result.
 */
.pace {
  stroke: color-mix(in srgb, var(--color-fg-soft) 70%, transparent);
  stroke-width: 2;
  stroke-dasharray: 4 4;
  stroke-linecap: round;
}

/* Top LEFT: the pace line ends at the ceiling on the right, and a label there
   sits on top of the one thing it is naming. */
.goal {
  @apply absolute top-1.5 left-2 text-[0.625rem] leading-none text-fg-soft
         px-1.5 py-1 rounded-sm;
  background-color: color-mix(in srgb, var(--color-panel) 70%, transparent);
}

/* The shelf a period had to reach. Rounded and solid rather than a dashed
   hairline: it is a thing to land on, not a rule being enforced. */
.shelves line {
  stroke: color-mix(in srgb, var(--color-fg-soft) 55%, transparent);
  stroke-width: 3;
}

.shelves line.met {
  stroke: color-mix(in srgb, var(--color-done) 60%, transparent);
}

.shelves line.ahead {
  stroke: color-mix(in srgb, var(--color-fg-soft) 22%, transparent);
}

.area {
  animation: lift 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes lift {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.trace {
  fill: none;
  stroke: var(--color-done);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 1px 6px color-mix(in srgb, var(--color-done) 50%, transparent));
}

/* Still running, so it is drawn as a promise rather than as a result. */
.trace.live {
  stroke-dasharray: 5 5;
  opacity: 0.8;
}

.halo {
  stroke: color-mix(in srgb, var(--color-done) 26%, transparent);
  stroke-width: 20;
  animation: pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: 420ms;
}

.halo.now {
  stroke: color-mix(in srgb, var(--color-accent) 30%, transparent);
}

/* A bubble: the ring is the state, the core is the panel showing through. */
.ring {
  stroke: var(--color-done);
  stroke-width: 9;
  animation: pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(220ms + var(--i) * 65ms);
}

.ring.short {
  stroke: color-mix(in srgb, var(--color-done) 62%, var(--color-void));
}

/* The present takes the accent, here as everywhere: never a fault, just now. */
.ring.now {
  stroke: var(--color-accent);
}

.core {
  stroke: var(--color-well);
  stroke-width: 4;
  animation: pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(240ms + var(--i) * 65ms);
}

@keyframes pop {
  from {
    stroke-width: 0;
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.columns {
  @apply absolute inset-0 grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}

.column {
  @apply relative cursor-pointer border-0 bg-transparent p-0;
  -webkit-tap-highlight-color: transparent;
}

.column:disabled {
  @apply cursor-not-allowed;
}

/* The lit column behind the period being read: a soft field, so the curve stays
   the loudest thing in the plot. */
.column-field {
  @apply absolute inset-y-0 left-1/2 w-[88%] -translate-x-1/2 opacity-0
         transition-opacity duration-200;
  border-radius: calc(var(--radius-md) - 2px);
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-fg) 11%, transparent),
    transparent 80%
  );
}

.column.on .column-field {
  @apply opacity-100;
}

@media (hover: hover) {
  .column:not(:disabled):hover .column-field {
    @apply opacity-60;
  }
}

.column:focus-visible {
  @apply outline-none;
}

.column:focus-visible .column-field {
  @apply opacity-100;
  box-shadow: inset 0 0 0 2px var(--color-accent);
}

/* The figures. One column each, the same seven the plot is ruled into. */
.scale {
  @apply grid mt-2;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}

.mark {
  @apply flex flex-col items-center gap-0.5 min-w-0 py-1 rounded-sm
         transition-colors duration-200;
}

.mark-count {
  @apply flex items-baseline gap-px;
}

/* Rounded display type rather than the panel's mono: these are the numbers the
   page is about, and they should read like a score, not like telemetry. */
.mark-done {
  @apply font-display text-[1.0625rem] leading-none font-semibold text-fg-soft;
}

.mark-target {
  @apply text-[0.625rem] leading-none text-fg-faint;
}

.mark-rest {
  @apply text-[0.6875rem] leading-none text-fg-faint;
}

.mark-label {
  @apply font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-fg-faint;
}

/* Target reached: the figure takes the done ink, which is the one piece of
   praise this page hands out. */
.mark.met .mark-done {
  color: var(--color-done);
}

.mark.now .mark-label {
  @apply text-accent-text;
}

.mark.on {
  background-color: color-mix(in srgb, var(--color-fg) 7%, transparent);
}

.mark.on .mark-done {
  @apply text-fg;
}

.mark.on.met .mark-done {
  color: var(--color-done);
}

.mark.ahead .mark-done {
  @apply text-fg-faint opacity-60;
}

.mark.ahead .mark-label {
  @apply opacity-55;
}

@media (prefers-reduced-motion: reduce) {
  .canvas,
  .area,
  .ring,
  .core,
  .halo {
    animation: none;
  }
}
</style>
