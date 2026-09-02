<script setup lang="ts">
import { WEEKDAY_LABELS, WEEKDAY_SHORT, type Weekday } from '@/entities'

defineProps<{ weekday: Weekday }>()
</script>

<template>
  <!-- Qua and Qui differ by one letter at this size, so the full name is on hover. -->
  <span class="badge" :title="WEEKDAY_LABELS[weekday]">{{ WEEKDAY_SHORT[weekday] }}</span>
</template>

<style scoped>
@reference "../assets/main.css";

.badge {
  @apply inline-block px-1.5 py-0.5 font-mono text-[0.625rem] font-medium uppercase
         tracking-[0.1em] leading-[1.5] whitespace-nowrap
         text-fg bg-well border border-line-strong rounded-[2px];
}
</style>
