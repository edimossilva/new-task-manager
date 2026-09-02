<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Task, TaskFrequency } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS, formatDate } from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'
import TaskCheckbox from '@/components/TaskCheckbox.vue'

const authStore = useAuthStore()
const store = useTaskStore()
const { referenceDate, isToday } = usePeriodSelection()

onMounted(() => store.loadAll())

function isCompleted(task: Task): boolean {
  return store.isCompletedFor(task, referenceDate.value)
}

function isLate(task: Task): boolean {
  return store.isLateOn(task, referenceDate.value)
}

// Only tasks actually due on the browsed date: ones created later never had a
// chance to be done, and a weekly task pinned to a weekday has not come up yet.
const visibleTasks = computed(() =>
  store.tasks.filter((task) => store.isDueOn(task, referenceDate.value)),
)

const completed = computed(() => visibleTasks.value.filter(isCompleted))
const pending = computed(() => visibleTasks.value.filter((task) => !isCompleted(task)))

const progress = computed(() => {
  if (visibleTasks.value.length === 0) return 0
  return Math.round((completed.value.length / visibleTasks.value.length) * 100)
})

const pendingByFrequency = computed(() =>
  FREQUENCIES.map((frequency) => ({
    frequency,
    tasks: pending.value.filter((task) => task.frequency === frequency),
  })).filter((group) => group.tasks.length > 0),
)

const firstName = computed(() => authStore.user?.displayName?.split(' ')[0] ?? '')

function groupLabel(frequency: TaskFrequency): string {
  return FREQUENCY_LABELS[frequency]
}
</script>

<template>
  <div class="flex items-center justify-between mb-6">
    <h1 class="!mb-0">Ola, {{ firstName }}</h1>
    <RouterLink to="/tasks" class="btn">Ver Tarefas</RouterLink>
  </div>

  <template v-if="store.tasks.length">
    <PeriodSelector />

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
      <div class="dash-card">
        <span class="dash-label">Concluidas</span>
        <span class="dash-value text-success">{{ completed.length }}</span>
      </div>
      <div class="dash-card">
        <span class="dash-label">Pendentes</span>
        <span class="dash-value text-primary">{{ pending.length }}</span>
      </div>
      <div class="dash-card">
        <span class="dash-label">Total de tarefas</span>
        <span class="dash-value">{{ visibleTasks.length }}</span>
      </div>
    </div>

    <div v-if="visibleTasks.length" class="mt-6">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[0.8125rem] font-medium text-text-secondary">
          {{ isToday ? 'Progresso do periodo' : `Progresso em ${formatDate(referenceDate)}` }}
        </span>
        <span class="text-[0.8125rem] font-semibold text-text">{{ progress }}%</span>
      </div>
      <div
        v-if="visibleTasks.length"
        class="h-2 w-full bg-surface-active rounded-full overflow-hidden"
      >
        <div
          class="h-full bg-success transition-[width] duration-300"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
    </div>

    <h2 class="mt-8 mb-3">Pendentes</h2>
    <p v-if="visibleTasks.length === 0">Nenhuma tarefa para este dia.</p>
    <p v-else-if="pendingByFrequency.length === 0">
      {{ isToday ? 'Tudo em dia por aqui.' : 'Tudo concluido neste dia.' }}
    </p>
    <div v-for="group in pendingByFrequency" :key="group.frequency" class="dash-section">
      <div class="flex items-center gap-2 mb-2">
        <FrequencyBadge :frequency="group.frequency" />
        <span class="text-[0.8125rem] text-text-muted">
          {{ group.tasks.length }} {{ group.tasks.length === 1 ? 'tarefa' : 'tarefas' }}
          <span class="sr-only">{{ groupLabel(group.frequency) }}</span>
        </span>
      </div>
      <ul>
        <li v-for="task in group.tasks" :key="task.id" class="dash-row">
          <TaskCheckbox
            :task="task"
            :completed="false"
            :period-label="formatDate(referenceDate)"
            @toggle="store.toggleCompletion(task.id, referenceDate)"
          />
          <span class="text-sm text-text-secondary">{{ task.title }}</span>
          <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
          <span v-if="isLate(task)" class="text-xs font-semibold text-danger">Atrasada</span>
        </li>
      </ul>
    </div>
  </template>

  <p v-else>
    Nenhuma tarefa cadastrada ainda.
    <RouterLink to="/tasks/new">Crie a primeira</RouterLink>
    para comecar.
  </p>
</template>

<style scoped>
@reference "../assets/main.css";

.dash-card {
  @apply flex flex-col gap-1 px-5 py-4 bg-surface border border-border rounded-lg;
}
.dash-label {
  @apply text-xs font-semibold uppercase tracking-widest text-text-muted;
}
.dash-value {
  @apply text-2xl font-bold text-text;
}
.dash-section {
  @apply mt-4 px-5 py-4 bg-surface border border-border rounded-lg;
}
.dash-row {
  @apply flex items-center gap-3 py-1.5;
}
</style>
