<script setup lang="ts">
import { computed } from 'vue'

/**
 * Past this many, cells stop being countable at a glance and stop being big
 * enough to hit, so the strip degrades to one continuous bar -- the same hatched
 * track the home meter uses, with the minus button as the fine control.
 */
const MAX_CELLS = 12

const props = withDefaults(defineProps<{ count: number; total: number; readonly?: boolean }>(), {
  readonly: false,
})
defineEmits<{ set: [count: number]; undo: [] }>()

const cells = computed(() => (props.total <= MAX_CELLS ? props.total : 0))
/** A lowered target can leave more checks recorded than the strip has cells. */
const filled = computed(() => Math.min(props.count, props.total))
const complete = computed(() => filled.value >= props.total)
const ratio = computed(() => (filled.value / props.total) * 100)

/** Zero-padded to the total's width, so the readout never reflows as it fills. */
const readout = computed(() => String(filled.value).padStart(String(props.total).length, '0'))
const description = computed(() => `${filled.value} de ${props.total} marcacoes`)
</script>

<template>
  <div class="gauge" :class="{ complete, readonly }">
    <!--
      Tapping a cell writes that exact count, so eight-a-day is eight taps or
      one. Tapping the last lit cell puts it back out, which is the fine undo
      the minus button provides in bar mode.
    -->
    <div
      v-if="cells"
      class="strip"
      :class="{ live: !readonly }"
      role="group"
      :aria-label="description"
    >
      <button
        v-for="n in cells"
        :key="n"
        type="button"
        class="cell"
        :class="{ on: n <= filled, next: !readonly && n === filled + 1 }"
        :disabled="readonly"
        :aria-pressed="n <= filled"
        :aria-label="`Marcar ${n} de ${total}`"
        :title="`${n}/${total}`"
        @click="$emit('set', n === filled ? n - 1 : n)"
      >
        <span class="mark"></span>
      </button>
    </div>

    <div v-else class="bar" role="img" :aria-label="description">
      <div class="bar-fill" :style="{ width: `${ratio}%` }"></div>
    </div>

    <span class="readout figure" aria-hidden="true">
      <span class="readout-count">{{ readout }}</span
      ><span class="slash">/</span>{{ total }}
    </span>

    <button
      v-if="!cells && !readonly"
      type="button"
      class="undo"
      :disabled="filled === 0"
      aria-label="Desfazer uma marcacao"
      title="Desfazer uma marcacao"
      @click="$emit('undo')"
    >
      &minus;
    </button>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.gauge {
  @apply flex items-center gap-2 min-w-0;
}

/* Cells stay a fixed size rather than stretching: a two-a-day task and an
   eight-a-day one should read as different amounts of the same unit. */
.strip {
  @apply flex items-stretch gap-[3px] h-[18px] shrink-0;
}

.cell {
  @apply w-[13px] p-0 bg-transparent border border-line-strong cursor-default;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 3px,
    var(--color-line-strong) 3px 4px
  );
  transition:
    background-color 160ms ease,
    border-color 140ms ease,
    box-shadow 240ms ease;
  -webkit-tap-highlight-color: transparent;
}

.strip.live .cell {
  @apply cursor-pointer;
}

/* Loaded: the hatch is painted over, and the cell carries its own light. */
.cell.on {
  background-image: none;
  background-color: var(--color-done);
  border-color: var(--color-done);
  box-shadow: 0 0 7px var(--color-done-dim);
  animation: load 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* The chamber up next, edged in the accent so the strip points at itself. */
.cell.next {
  border-color: var(--color-accent-text);
}

.strip.live .cell:hover {
  border-color: var(--color-accent-text);
  background-color: var(--color-accent-dim);
}

.strip.live .cell.on:hover {
  background-color: var(--color-done);
  opacity: 0.72;
}

.cell:focus-visible {
  @apply outline-none;
  box-shadow: 0 0 0 2px var(--color-accent-dim);
}

/* Above twelve: one bar, same hatch, no per-cell hit target to miss. */
.bar {
  @apply relative h-[10px] w-full max-w-[168px] min-w-[80px] overflow-hidden border border-line-strong;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 3px,
    var(--color-line-strong) 3px 4px
  );
}

.bar-fill {
  @apply h-full;
  background-color: var(--color-done);
  box-shadow: 0 0 8px var(--color-done-dim);
  transition: width 340ms cubic-bezier(0.22, 1, 0.36, 1);
}

.readout {
  @apply text-[0.8125rem] leading-none text-fg-soft whitespace-nowrap;
}

.readout-count {
  @apply font-medium text-fg;
}

.gauge.complete .readout-count {
  color: var(--color-done);
}

.slash {
  @apply text-fg-faint mx-px;
}

.undo {
  @apply flex items-center justify-center w-7 h-7 shrink-0 text-[0.9375rem] leading-none
         text-fg-soft bg-well border border-line-strong cursor-pointer
         transition-[color,border-color] duration-[140ms];
  border-radius: 2px;
  -webkit-tap-highlight-color: transparent;
}

.undo:hover:not(:disabled) {
  @apply text-fg border-accent-text;
}

.undo:focus-visible {
  @apply outline-none border-accent;
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

.undo:disabled {
  @apply text-fg-faint border-line cursor-default;
}

/* A round seating itself: the cell drops in rather than blinking on. */
@keyframes load {
  from {
    transform: scaleY(0.4);
  }
  to {
    transform: scaleY(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cell.on .mark {
    animation: none;
  }
  .bar-fill {
    transition: none;
  }
}
</style>
