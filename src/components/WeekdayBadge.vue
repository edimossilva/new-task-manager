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
  @apply inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap
         text-text-secondary bg-surface-active;
}
</style>
