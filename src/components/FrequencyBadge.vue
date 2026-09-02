<script setup lang="ts">
import { FREQUENCY_LABELS, type TaskFrequency } from '@/entities'

defineProps<{ frequency: TaskFrequency }>()
</script>

<template>
  <span class="badge" :class="frequency">{{ FREQUENCY_LABELS[frequency] }}</span>
</template>

<style scoped>
@reference "../assets/main.css";

/* An overprinted ink chip: coloured rule, tinted ground, letterspaced mono. */
.badge {
  @apply inline-block px-1.5 py-0.5 font-mono text-[0.625rem] font-medium uppercase
         tracking-[0.1em] leading-[1.5] whitespace-nowrap border rounded-[2px];
}
.badge.daily {
  @apply text-freq-daily border-freq-daily bg-flare-dim;
}
.badge.weekly {
  color: var(--color-freq-weekly);
  border-color: var(--color-freq-weekly);
  background: color-mix(in srgb, var(--color-freq-weekly) 10%, transparent);
}
.badge.monthly {
  color: var(--color-freq-monthly);
  border-color: var(--color-freq-monthly);
  background: color-mix(in srgb, var(--color-freq-monthly) 12%, transparent);
}
.badge.yearly {
  color: var(--color-freq-yearly);
  border-color: var(--color-freq-yearly);
  background: color-mix(in srgb, var(--color-freq-yearly) 10%, transparent);
}
</style>
