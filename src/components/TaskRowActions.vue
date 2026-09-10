<script setup lang="ts">
import type { Task } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import TaskInfoLink from '@/components/TaskInfoLink.vue'

defineProps<{ task: Task }>()
defineEmits<{ delete: [id: string] }>()

const store = useTaskStore()
</script>

<template>
  <!--
    The four things the REGISTRY can do to a task: take it out of the routine,
    read it, edit it, destroy it. One component because the table and the
    card list under it would otherwise carry the same four glyphs twice, and
    two copies of an icon set are two icon sets.

    Icons, not words: these four repeat identically on every row, so there is
    nothing to read twice, and four labelled links would not fit a card three
    across.
  -->
  <div class="task-actions">
    <!--
      Power, not a checkbox: taking a task out of the routine is a state the
      row wears, and the same key puts it back.
    -->
    <button
      type="button"
      class="task-action"
      :class="{ lit: !task.active }"
      :aria-pressed="!task.active"
      :aria-label="`${task.active ? 'Desativar' : 'Ativar'} ${task.title}`"
      :title="task.active ? 'Desativar' : 'Ativar'"
      @click="store.setActive(task.id, !task.active)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2.3v4.5" />
        <path d="M4.9 4.5a5 5 0 1 0 6.2 0" />
      </svg>
    </button>

    <TaskInfoLink :task="task" />

    <RouterLink
      :to="`/tasks/${task.id}/edit`"
      class="task-action"
      :aria-label="`Editar ${task.title}`"
      title="Editar"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10.9 2.6 13.4 5.1 5.7 12.8 2.6 13.4 3.2 10.3z" />
        <path d="M9.5 4 12 6.5" />
      </svg>
    </RouterLink>

    <button
      type="button"
      class="task-action danger"
      :aria-label="`Excluir ${task.title}`"
      title="Excluir"
      @click="$emit('delete', task.id)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.8 4.3h10.4" />
        <path d="M4.4 4.3 5.1 13.2h5.8l.7-8.9" />
        <path d="M6.2 4.3V2.8h3.6v1.5" />
        <path d="M6.7 6.6v4.3M9.3 6.6v4.3" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

/* Only the strip's layout lives here: `.task-action` is a shared control
   shape, since `TaskInfoLink` draws one on its own out on the rack. */
.task-actions {
  @apply flex items-center shrink-0 -my-1;
}
</style>
