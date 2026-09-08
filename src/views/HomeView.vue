<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Task } from '@/entities'
import { FREQUENCY_ORDER, formatDate } from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import { useCategoryRack } from '@/composables/use-category-rack'
import CategoryTaskCard from '@/components/CategoryTaskCard.vue'
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

// Check-level totals, alongside the task-level ratio rather than replacing it:
// a task at 3/8 is still one task left to finish, and the meter says so.
const hasRepeats = computed(() => visibleTasks.value.some((task) => task.timesPerPeriod > 1))

const checkTally = computed(() =>
  visibleTasks.value.reduce(
    (tally, task) => ({
      done:
        tally.done +
        Math.min(store.completionCountFor(task, referenceDate.value), task.timesPerPeriod),
      total: tally.total + task.timesPerPeriod,
    }),
    { done: 0, total: 0 },
  ),
)

const progress = computed(() => {
  if (visibleTasks.value.length === 0) return 0
  return Math.round((completed.value.length / visibleTasks.value.length) * 100)
})

/** Atrasada, then pending, then done -- the same order the tasks page defaults to. */
function statusRank(task: Task): number {
  if (isCompleted(task)) return 2
  return store.isLateOn(task, referenceDate.value) ? 0 : 1
}

/**
 * A card holds its whole category now, so the sort carries what the Pendentes /
 * Concluidas split used to say: what needs attention rises, what is done sinks.
 * Frequency was the grouping before categories took that job, and survives here
 * as the tie-break -- dailies first, alphabetical inside each.
 */
const sortedTasks = computed(() =>
  [...visibleTasks.value].sort(
    (a, b) =>
      statusRank(a) - statusRank(b) ||
      FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency] ||
      a.title.localeCompare(b.title),
  ),
)

const rack = useCategoryRack(sortedTasks)

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
      <div class="meter-foot">
        <p class="meter-label">
          {{ progress === 100 ? 'Tudo concluido' : `${pending.length} restantes` }}
        </p>
        <p v-if="hasRepeats" class="meter-checks figure">
          {{ checkTally.done }}<span class="meter-slash">/</span>{{ checkTally.total }} marcacoes
        </p>
      </div>
    </section>

    <p v-if="rack.length === 0" class="section-empty">Nenhuma tarefa para este dia.</p>
    <div v-else class="rack mt-5">
      <CategoryTaskCard
        v-for="(unit, index) in rack"
        :key="unit.key"
        :category="unit.category"
        :tasks="unit.tasks"
        :index="index"
        compact
      />
    </div>
  </template>

  <div v-else class="empty">
    <p class="empty-line">Nada por aqui ainda.</p>
    <RouterLink to="/tasks/new" class="btn mt-4">Criar a primeira tarefa</RouterLink>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-accent-text mb-1;
}

.meter {
  @apply px-4 py-3.5 bg-panel border-2 border-fg rounded-sm;
  box-shadow: var(--panel-shadow);
}

.meter-head {
  @apply flex items-baseline justify-between gap-2;
}

.meter-figure {
  @apply text-[1.9rem] leading-none font-medium text-fg;
  text-shadow: 0 0 18px var(--color-accent-dim);
}

.meter-slash {
  @apply text-fg-faint mx-0.5;
}

.meter-pct {
  @apply text-[0.8125rem] text-fg-soft;
}

/* Hatched track so an empty meter still reads as a scale, not a void. */
.meter-track {
  @apply relative h-2.5 w-full mt-2.5 border border-fg overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.meter-fill {
  @apply h-full bg-accent transition-[width] duration-500;
}

.meter-foot {
  @apply flex items-baseline justify-between gap-3 mt-2;
}

.meter-label {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.12em] text-fg-faint;
}

.meter-checks {
  @apply text-[0.625rem] font-medium uppercase tracking-[0.12em] text-fg-faint;
}

.section-empty {
  @apply mt-1 text-[0.875rem] text-fg-faint;
}

.empty {
  @apply flex flex-col items-center mt-10 px-5 py-10 text-center
         bg-panel border border-dashed border-line-strong rounded-sm;
}

.empty-line {
  @apply font-display text-[1.25rem] font-semibold text-fg;
}
</style>
