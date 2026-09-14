<script setup lang="ts">
import { computed } from 'vue'
import { TURN_LABELS, TURN_RANGES, type Turn } from '@/entities'

const props = withDefaults(
  defineProps<{
    turn: Turn
    count?: number
    /** Every slot of this turn is checked off. */
    done?: boolean
    /** Its deadline has passed with a slot still open. */
    late?: boolean
    /** It is the turn the clock is in, and a slot is still open. */
    current?: boolean
  }>(),
  { count: 1, done: false, late: false, current: false },
)

/*
 * The three are mutually exclusive by construction -- a turn's slots are
 * contiguous, so a group is either fully covered, or before the running turn, or
 * the running one -- but the order here is the one to trust if that ever slips.
 */
const state = computed(() =>
  props.done ? 'done' : props.late ? 'late' : props.current ? 'current' : '',
)

const STATE_WORDS: Record<string, string> = {
  done: 'concluida',
  late: 'atrasada',
  current: 'agora',
}

const title = computed(() => {
  const base = `${TURN_LABELS[props.turn]} (${TURN_RANGES[props.turn]})`
  const word = STATE_WORDS[state.value]
  return word ? `${base} - ${word}` : base
})
</script>

<template>
  <!--
    Neutral like the weekday chip, not inked like the frequency one: a turn is a
    detail of the cadence the badge beside it already names, and two saturated
    chips in a row was already too much on a phone. It takes colour only when the
    clock has something to say about it.
  -->
  <span class="badge" :class="state" :title="title">
    <!--
      The dial's own tick, in miniature. A checked turn is the one state that
      must survive the accent being any colour the user likes, including a green
      or a red -- so it is marked by a SHAPE as well as by the done ink.
    -->
    <svg v-if="done" class="tick" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 16.5 L13.5 22 L24 10.5" />
    </svg>
    {{ TURN_LABELS[turn] }}<template v-if="count > 1">&nbsp;&times;{{ count }}</template>
  </span>
</template>

<style scoped>
@reference "../assets/main.css";

.badge {
  @apply inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[0.625rem] font-medium
         uppercase tracking-[0.1em] leading-[1.5] whitespace-nowrap
         text-fg bg-well border border-line-strong rounded-[2px];
}

.tick {
  @apply w-[9px] h-[9px] shrink-0 -ml-px;
  fill: none;
  stroke: currentColor;
  stroke-width: 3.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Checked off: the app's done ink, the same one the dial and the cells wear. */
.badge.done {
  color: var(--color-done);
  border-color: var(--color-done);
  background: var(--color-done-dim);
}

/* The turn whose deadline has passed with the slot still open. */
.badge.late {
  color: var(--color-alarm);
  border-color: var(--color-alarm);
  background: var(--color-alarm-dim);
}

/* The turn the clock is in. Disjoint from `late` -- one is before now, one is now. */
.badge.current {
  color: var(--color-accent-text);
  border-color: var(--color-accent-text);
  background: var(--color-accent-dim);
}
</style>
