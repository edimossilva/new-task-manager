<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Task } from '@/entities'
import { FREQUENCIES, formatDate } from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import DashTaskGroups, { type TaskGroup } from '@/components/DashTaskGroups.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'

const authStore = useAuthStore()
const store = useTaskStore()
const { referenceDate, isToday } = usePeriodSelection()

onMounted(() => store.loadAll())

function isCompleted(task: Task): boolean {
  return store.isCompletedFor(task, referenceDate.value)
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

function groupByFrequency(tasks: Task[]): TaskGroup[] {
  return FREQUENCIES.map((frequency) => ({
    frequency,
    tasks: tasks.filter((task) => task.frequency === frequency),
  })).filter((group) => group.tasks.length > 0)
}

const pendingByFrequency = computed(() => groupByFrequency(pending.value))
const completedByFrequency = computed(() => groupByFrequency(completed.value))

const firstName = computed(() => authStore.user?.displayName?.split(' ')[0] ?? '')
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
    <DashTaskGroups :groups="pendingByFrequency" :completed="false" />

    <template v-if="completedByFrequency.length">
      <h2 class="mt-8 mb-3">Concluidas</h2>
      <DashTaskGroups :groups="completedByFrequency" :completed="true" />
    </template>
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
</style>
