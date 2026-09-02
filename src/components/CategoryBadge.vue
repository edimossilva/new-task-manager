<script setup lang="ts">
import type { Category } from '@/entities'

defineProps<{ category: Category }>()
</script>

<template>
  <span class="badge" :class="`ink-${category.ink}`" :title="category.description || category.name">
    <span class="dot" aria-hidden="true"></span>
    {{ category.name }}
  </span>
</template>

<style scoped>
@reference "../assets/main.css";

/*
 * Deliberately quieter than FrequencyBadge: a solid ink dot plus plain text.
 * Two fully coloured chips per row was too noisy on a phone, so only one of the
 * pair carries a filled ground.
 */
.badge {
  @apply inline-flex items-center gap-1.5 max-w-[11rem] font-sans text-[0.6875rem]
         font-semibold uppercase tracking-[0.06em] whitespace-nowrap overflow-hidden
         text-ellipsis;
  color: var(--cat);
}

.dot {
  @apply w-2 h-2 shrink-0 rounded-full border;
  background: var(--cat);
  border-color: var(--cat);
}

.ink-flare {
  --cat: var(--color-cat-flare);
}
.ink-ultra {
  --cat: var(--color-cat-ultra);
}
.ink-moss {
  --cat: var(--color-cat-moss);
}
.ink-ochre {
  --cat: var(--color-cat-ochre);
}
.ink-plum {
  --cat: var(--color-cat-plum);
}
.ink-clay {
  --cat: var(--color-cat-clay);
}
.ink-teal {
  --cat: var(--color-cat-teal);
}
.ink-ink {
  --cat: var(--color-cat-ink);
}
</style>
