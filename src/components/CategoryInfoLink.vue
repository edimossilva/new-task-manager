<script setup lang="ts">
import type { Category } from '@/entities'

defineProps<{ category: Category }>()
</script>

<template>
  <!--
    The way into a category's own page. The task rows have `TaskInfoLink` and
    wear the same glyph for the same job; the shape comes from the shared
    `.task-action` class, which is what makes an icon in a row of icons look
    like one control set rather than two.
  -->
  <RouterLink
    :to="`/categories/${category.id}`"
    class="task-action"
    :aria-label="`Detalhes de ${category.name}`"
    title="Detalhes e medidores"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.4v4.1" />
      <circle class="solid" cx="8" cy="4.7" r="0.9" />
    </svg>
  </RouterLink>
</template>
