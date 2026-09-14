<script setup lang="ts">
import { TURN_LABELS, TURN_RANGES, type Turn } from '@/entities'

withDefaults(defineProps<{ turn: Turn; count?: number; late?: boolean }>(), {
  count: 1,
  late: false,
})
</script>

<template>
  <!--
    Neutral like the weekday chip, not inked like the frequency one: a turn is a
    detail of the cadence the badge beside it already names, and two saturated
    chips in a row was already too much on a phone.
  -->
  <span class="badge" :class="{ late }" :title="`${TURN_LABELS[turn]} (${TURN_RANGES[turn]})`">
    {{ TURN_LABELS[turn] }}<template v-if="count > 1">&nbsp;&times;{{ count }}</template>
  </span>
</template>

<style scoped>
@reference "../assets/main.css";

.badge {
  @apply inline-block px-1.5 py-0.5 font-mono text-[0.625rem] font-medium uppercase
         tracking-[0.1em] leading-[1.5] whitespace-nowrap
         text-fg bg-well border border-line-strong rounded-[2px];
}

/* The turn whose deadline has passed with the slot still open. */
.badge.late {
  color: var(--color-alarm);
  border-color: var(--color-alarm);
  background: var(--color-alarm-dim);
}
</style>
