<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Task, TaskFrequency } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS } from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { useCurrentPeriod } from '@/composables/use-current-period'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import TaskCheckbox from '@/components/TaskCheckbox.vue'

const authStore = useAuthStore()
const store = useTaskStore()
const { now } = useCurrentPeriod()

onMounted(() => store.loadAll())

function isCompleted(task: Task): boolean {
  return store.isCompletedFor(task, now.value)
}

const completed = computed(() => store.tasks.filter(isCompleted))
const pending = computed(() => store.tasks.filter((task) => !isCompleted(task)))

const progress = computed(() => {
  if (store.tasks.length === 0) return 0
  return Math.round((completed.value.length / store.tasks.length) * 100)
})

const pendingByFrequency = computed(() =>
  FREQUENCIES.map((frequency) => ({
    frequency,
    tasks: pending.value.filter((task) => task.frequency === frequency),
  })).filter((group) => group.tasks.length > 0),
)

const firstName = computed(() => authStore.user?.name.split(' ')[0] ?? '')

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
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <span class="dash-value">{{ store.tasks.length }}</span>
      </div>
    </div>

    <div class="mt-6">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[0.8125rem] font-medium text-text-secondary">Progresso do periodo</span>
        <span class="text-[0.8125rem] font-semibold text-text">{{ progress }}%</span>
      </div>
      <div class="h-2 w-full bg-surface-active rounded-full overflow-hidden">
        <div
          class="h-full bg-success transition-[width] duration-300"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
    </div>

    <h2 class="mt-8 mb-3">Pendentes</h2>
    <p v-if="pendingByFrequency.length === 0">Tudo em dia por aqui.</p>
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
            @toggle="store.toggleCompletion(task.id, now)"
          />
          <span class="text-sm text-text-secondary">{{ task.title }}</span>
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
