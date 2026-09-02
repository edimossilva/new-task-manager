<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Task } from '@/entities'
import { FREQUENCIES, formatDate } from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import DashTaskGroups, { type TaskGroup } from '@/components/DashTaskGroups.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'

const authStore = useAuthStore()
const store = useTaskStore()
const categoryStore = useCategoryStore()
const { referenceDate, isToday } = usePeriodSelection()

onMounted(() => {
  store.loadAll()
  categoryStore.loadAll()
})

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
  <header class="flex items-start justify-between gap-3 mb-5">
    <div class="min-w-0">
      <p class="eyebrow">{{ isToday ? 'Hoje' : formatDate(referenceDate) }}</p>
      <h1 class="!mb-0 truncate">Ola, {{ firstName }}</h1>
    </div>
    <RouterLink to="/tasks/new" class="btn shrink-0">Nova</RouterLink>
  </header>

  <template v-if="store.tasks.length">
    <PeriodSelector />

    <!-- One figure, read at a glance: the ratio, drawn as a ruled meter. -->
    <section v-if="visibleTasks.length" class="meter" aria-label="Progresso">
      <div class="meter-head">
        <span class="meter-figure figure">
          {{ completed.length }}<span class="meter-slash">/</span>{{ visibleTasks.length }}
        </span>
        <span class="meter-pct figure">{{ progress }}%</span>
      </div>
      <div class="meter-track">
        <div class="meter-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <p class="meter-label">
        {{ progress === 100 ? 'Tudo concluido' : `${pending.length} restantes` }}
      </p>
    </section>

    <h2 class="mt-7 mb-1">Pendentes</h2>
    <p v-if="visibleTasks.length === 0" class="section-empty">Nenhuma tarefa para este dia.</p>
    <p v-else-if="pendingByFrequency.length === 0" class="section-empty">
      {{ isToday ? 'Tudo em dia por aqui.' : 'Tudo concluido neste dia.' }}
    </p>
    <DashTaskGroups :groups="pendingByFrequency" :completed="false" />

    <template v-if="completedByFrequency.length">
      <h2 class="mt-7 mb-1">Concluidas</h2>
      <DashTaskGroups :groups="completedByFrequency" :completed="true" />
    </template>
  </template>

  <div v-else class="empty">
    <p class="empty-line">Nada por aqui ainda.</p>
    <RouterLink to="/tasks/new" class="btn mt-4">Criar a primeira tarefa</RouterLink>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-flare-deep mb-1;
}

.meter {
  @apply px-4 py-3.5 bg-paper-raised border-2 border-ink rounded-sm;
  box-shadow: var(--shadow-stamp-sm);
}

.meter-head {
  @apply flex items-baseline justify-between gap-2;
}

.meter-figure {
  @apply text-[1.75rem] leading-none font-medium text-ink;
}

.meter-slash {
  @apply text-ink-faint mx-0.5;
}

.meter-pct {
  @apply text-[0.8125rem] text-ink-soft;
}

/* Hatched track so an empty meter still reads as a scale, not a void. */
.meter-track {
  @apply relative h-2.5 w-full mt-2.5 border border-ink overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-rule) 3px 4px);
}

.meter-fill {
  @apply h-full bg-flare transition-[width] duration-500;
}

.meter-label {
  @apply mt-2 font-mono text-[0.625rem] font-medium uppercase tracking-[0.12em] text-ink-faint;
}

.section-empty {
  @apply mt-1 text-[0.875rem] text-ink-faint;
}

.empty {
  @apply flex flex-col items-center mt-10 px-5 py-10 text-center
         bg-paper-raised border border-dashed border-rule-strong rounded-sm;
}

.empty-line {
  @apply font-display text-[1.25rem] font-semibold text-ink;
  font-variation-settings:
    'SOFT' 20,
    'WONK' 1;
}
</style>
