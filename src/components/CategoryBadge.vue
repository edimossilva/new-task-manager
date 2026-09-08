<script setup lang="ts">
import { computed } from 'vue'
import type { Category } from '@/entities'
import { INKS } from '@/entities'

const props = defineProps<{ category: Category }>()

// Bound inline rather than through per-ink classes: twenty inks would mean
// twenty near-identical rules in every component that renders one.
const ink = computed(() => INKS[props.category.ink])
</script>

<template>
  <span
    class="badge ink-text"
    :style="{ '--cat-deep': ink.deep, '--cat-bright': ink.bright, '--cat-base': ink.base }"
    :title="category.description || category.name"
  >
    <span class="dot" aria-hidden="true"></span>
    {{ category.name }}
  </span>
</template>

<style scoped>
@reference "../assets/main.css";

/*
 * Deliberately quieter than FrequencyBadge: a solid ink dot plus text, no
 * filled ground. Two fully coloured chips per row was too noisy on a phone.
 *
 * The TEXT is left to `.ink-text`, the shared rule that picks the ink's `deep`
 * or `bright` value per theme: at 11px a light amber is unreadable on paper,
 * and its darkened twin is unreadable on near-black. The dot keeps `base`,
 * where saturation is free, and takes its edge from `currentColor` so it can
 * never disagree with the label beside it.
 */
.badge {
  @apply inline-flex items-center gap-1.5 max-w-[11rem] font-sans text-[0.6875rem]
         font-semibold uppercase tracking-[0.06em] whitespace-nowrap overflow-hidden
         text-ellipsis;
}

.dot {
  @apply w-2 h-2 shrink-0 rounded-full border;
  background: var(--cat-base);
  border-color: currentColor;
}
</style>
