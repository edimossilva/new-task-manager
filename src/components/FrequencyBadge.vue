<script setup lang="ts">
import { FREQUENCY_LABELS, type TaskFrequency } from '@/entities'

defineProps<{ frequency: TaskFrequency }>()
</script>

<template>
  <span class="badge" :class="frequency">{{ FREQUENCY_LABELS[frequency] }}</span>
</template>

<style scoped>
@reference "../assets/main.css";

.badge {
  @apply inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap;
}
.badge.daily {
  @apply bg-freq-daily;
}
.badge.weekly {
  @apply bg-freq-weekly;
}
.badge.monthly {
  @apply bg-freq-monthly;
}
.badge.yearly {
  @apply bg-freq-yearly;
}
</style>
