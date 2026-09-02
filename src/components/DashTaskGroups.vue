<script setup lang="ts">
import type { Task, TaskFrequency } from '@/entities'
import { FREQUENCY_LABELS, formatDate } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import CategoryBadge from '@/components/CategoryBadge.vue'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TaskStamp from '@/components/TaskStamp.vue'

export interface TaskGroup {
  frequency: TaskFrequency
  tasks: Task[]
}

const props = defineProps<{ groups: TaskGroup[]; completed: boolean }>()

const store = useTaskStore()
const categoryStore = useCategoryStore()
const { referenceDate } = usePeriodSelection()

function categoryOf(task: Task) {
  return task.categoryId ? categoryStore.byId.get(task.categoryId) : undefined
}

function isLate(task: Task): boolean {
  // A completed task is never late, so the tag only belongs on the pending list.
  return !props.completed && store.isLateOn(task, referenceDate.value)
}
</script>

<template>
  <div v-for="group in groups" :key="group.frequency" class="group">
    <div class="group-head">
      <FrequencyBadge :frequency="group.frequency" />
      <span class="group-count figure">
        {{ group.tasks.length }}
        <span class="sr-only">
          {{ group.tasks.length === 1 ? 'tarefa' : 'tarefas' }}
          {{ FREQUENCY_LABELS[group.frequency] }}
        </span>
      </span>
    </div>
    <ul>
      <li v-for="task in group.tasks" :key="task.id" class="row">
        <TaskStamp
          :task="task"
          :completed="completed"
          :period-label="formatDate(referenceDate)"
          @toggle="store.toggleCompletion(task.id, referenceDate)"
        />
        <span class="row-body">
          <span class="row-title" :class="{ struck: completed }">{{ task.title }}</span>
          <CategoryBadge v-if="categoryOf(task)" :category="categoryOf(task)!" class="mt-0.5" />
        </span>
        <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
        <span v-if="isLate(task)" class="late">Atrasada</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.group {
  @apply mt-3 px-4 py-3 bg-panel border border-line-strong rounded-sm;
}

.group-head {
  @apply flex items-center justify-between gap-2 pb-2 mb-1 border-b border-line;
}

.group-count {
  @apply text-[0.8125rem] text-fg-faint;
}

/* Ruled rows, hairline between, like a printed list. */
.row {
  @apply flex items-center gap-3 py-2.5 border-b border-line;
}
.row:last-child {
  @apply border-b-0 pb-0;
}

.row-body {
  @apply flex flex-col flex-1 min-w-0 items-start;
}

.row-title {
  @apply text-[0.9375rem] leading-snug text-fg break-words;
}

.row-title.struck {
  @apply text-fg-faint line-through decoration-[1.5px];
  text-decoration-color: var(--color-done);
}

.late {
  @apply shrink-0 font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-void bg-accent-text px-1.5 py-0.5 rounded-[2px];
}
</style>
