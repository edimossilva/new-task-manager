<script setup lang="ts">
import type { Task } from '@/entities'

defineProps<{ task: Task }>()
</script>

<template>
  <!--
    The way into a task's own page, and the one action that belongs on EVERY
    list of tasks: reading a task is safe everywhere, while editing, switching
    it off and deleting it belong to the registry. Its own component because
    the rack row and `TaskRowActions` both draw it, and a glyph drawn twice is
    a glyph that drifts. The shape comes from the shared `.task-action` class.
  -->
  <RouterLink
    :to="`/tasks/${task.id}`"
    class="task-action"
    :aria-label="`Detalhes de ${task.title}`"
    title="Detalhes e historico"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.4v4.1" />
      <circle class="solid" cx="8" cy="4.7" r="0.9" />
    </svg>
  </RouterLink>
</template>
