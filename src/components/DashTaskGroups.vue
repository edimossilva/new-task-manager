<script setup lang="ts">
import type { Task, TaskFrequency } from '@/entities'
import { FREQUENCY_LABELS, formatDate } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TaskCheckbox from '@/components/TaskCheckbox.vue'

export interface TaskGroup {
  frequency: TaskFrequency
  tasks: Task[]
}

const props = defineProps<{ groups: TaskGroup[]; completed: boolean }>()

const store = useTaskStore()
const { referenceDate } = usePeriodSelection()

function isLate(task: Task): boolean {
  // A completed task is never late, so the tag only belongs on the pending list.
  return !props.completed && store.isLateOn(task, referenceDate.value)
}
</script>

<template>
  <div v-for="group in groups" :key="group.frequency" class="dash-section">
    <div class="flex items-center gap-2 mb-2">
      <FrequencyBadge :frequency="group.frequency" />
      <span class="text-[0.8125rem] text-text-muted">
        {{ group.tasks.length }} {{ group.tasks.length === 1 ? 'tarefa' : 'tarefas' }}
        <span class="sr-only">{{ FREQUENCY_LABELS[group.frequency] }}</span>
      </span>
    </div>
    <ul>
      <li v-for="task in group.tasks" :key="task.id" class="dash-row">
        <TaskCheckbox
          :task="task"
          :completed="completed"
          :period-label="formatDate(referenceDate)"
          @toggle="store.toggleCompletion(task.id, referenceDate)"
        />
        <span
          class="text-sm"
          :class="completed ? 'line-through text-text-muted' : 'text-text-secondary'"
        >
          {{ task.title }}
        </span>
        <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
        <span v-if="isLate(task)" class="text-xs font-semibold text-danger">Atrasada</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.dash-section {
  @apply mt-4 px-5 py-4 bg-surface border border-border rounded-lg;
}
.dash-row {
  @apply flex items-center gap-3 py-1.5;
}
</style>
