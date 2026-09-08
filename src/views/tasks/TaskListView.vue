<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Task, TaskFrequency } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS, FREQUENCY_ORDER, matchesFrequency } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import { useSortable } from '@/composables/use-sortable'
import { useCategoryRack } from '@/composables/use-category-rack'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'
import CategoryTaskCard from '@/components/CategoryTaskCard.vue'

type StatusFilter = 'all' | 'pending' | 'completed'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'completed', label: 'Concluidas' },
]

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'status', label: 'Situacao' },
  { value: 'title', label: 'Titulo' },
  { value: 'frequency', label: 'Frequencia' },
  { value: 'lastCompletion', label: 'Ultima conclusao' },
]

const store = useTaskStore()
const categoryStore = useCategoryStore()
const { referenceDate } = usePeriodSelection()

const frequencyFilter = ref<TaskFrequency | 'all'>('all')
const statusFilter = ref<StatusFilter>('all')

const confirmDialog = ref<InstanceType<typeof ConfirmDialog>>()
const pendingDeleteId = ref<string>()

function isCompleted(task: Task): boolean {
  return store.isCompletedFor(task, referenceDate.value)
}

function isLate(task: Task): boolean {
  return store.isLateOn(task, referenceDate.value)
}

// Due on the selected day and matching the frequency filter, before the status
// tab narrows it. The tab counts read this, so they stay stable as you switch.
const dueTasks = computed(() =>
  store.tasks.filter((task) => {
    if (!store.isDueOn(task, referenceDate.value)) return false
    return frequencyFilter.value === 'all' || task.frequency === frequencyFilter.value
  }),
)

const statusCounts = computed(() => ({
  all: dueTasks.value.length,
  // Overdue counts as pending -- it is not completed. Deliberate, do not "fix".
  pending: dueTasks.value.filter((task) => !isCompleted(task)).length,
  completed: dueTasks.value.filter((task) => isCompleted(task)).length,
}))

const filteredTasks = computed(() =>
  dueTasks.value.filter((task) => {
    if (statusFilter.value === 'pending') return !isCompleted(task)
    if (statusFilter.value === 'completed') return isCompleted(task)
    return true
  }),
)

/** The latest completion key written under the task's CURRENT frequency. */
function lastCompletionKey(task: Task): string {
  const own = task.completions.filter((entry) => matchesFrequency(task.frequency, entry.key))
  return own[own.length - 1]?.key ?? ''
}

// Sorting orders the rows INSIDE every card, so there is no key for category:
// the cards are the categories. Situacao leads by default, which puts what needs
// attention at the top of each unit.
const { sortedItems, sortKey, sortAsc, sortBy } = useSortable(
  filteredTasks,
  {
    title: (task) => task.title.toLowerCase(),
    // Sort on the ordinal, not the label, so Diaria comes before Semanal.
    frequency: (task) => FREQUENCY_ORDER[task.frequency],
    // Ascending puts what needs attention first: Atrasada, Pendente, Concluida.
    status: (task) => (isCompleted(task) ? 2 : isLate(task) ? 0 : 1),
    lastCompletion: lastCompletionKey,
  },
  { key: 'status' },
)

// One card per category, in name order, with the unfiled bucket last.
const rack = useCategoryRack(sortedItems)

onMounted(() => {
  store.loadAll()
  categoryStore.loadAll()
})

function confirmDelete(id: string) {
  pendingDeleteId.value = id
  confirmDialog.value?.open()
}

function handleDelete() {
  if (pendingDeleteId.value) store.remove(pendingDeleteId.value)
}

const hiddenCount = computed(
  () => store.tasks.filter((task) => !store.isDueOn(task, referenceDate.value)).length,
)
</script>

<template>
  <header class="flex items-start justify-between gap-3 mb-5">
    <h1 class="!mb-0">Tarefas</h1>
    <RouterLink to="/tasks/new" class="btn shrink-0">Nova</RouterLink>
  </header>

  <p v-if="store.error" class="error">{{ store.error }}</p>

  <PeriodSelector v-if="store.tasks.length" />

  <div v-if="store.tasks.length" class="flex flex-wrap items-end gap-3 mb-3">
    <div>
      <label for="frequency-filter">Frequencia</label>
      <select id="frequency-filter" v-model="frequencyFilter" class="select-compact">
        <option value="all">Todas</option>
        <option v-for="frequency in FREQUENCIES" :key="frequency" :value="frequency">
          {{ FREQUENCY_LABELS[frequency] }}
        </option>
      </select>
    </div>
    <div>
      <label for="sort-key">Ordenar</label>
      <div class="flex items-stretch gap-1.5">
        <select
          id="sort-key"
          class="select-compact"
          :value="sortKey"
          @change="sortBy(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button
          type="button"
          class="dir"
          :aria-label="sortAsc ? 'Ordem crescente, inverter' : 'Ordem decrescente, inverter'"
          @click="sortBy(sortKey!)"
        >
          {{ sortAsc ? '↑' : '↓' }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="store.tasks.length" class="tabs" role="tablist">
    <button
      v-for="tab in STATUS_TABS"
      :key="tab.value"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="statusFilter === tab.value"
      @click="statusFilter = tab.value"
    >
      {{ tab.label }}
      <span class="tab-count">{{ statusCounts[tab.value] }}</span>
    </button>
  </div>

  <div v-if="rack.length" class="rack mt-4">
    <CategoryTaskCard
      v-for="(unit, index) in rack"
      :key="unit.key"
      :category="unit.category"
      :tasks="unit.tasks"
      :index="index"
      @delete="confirmDelete"
    />
  </div>

  <div v-else class="empty">
    <p v-if="store.tasks.length === 0">
      Nenhuma tarefa cadastrada.
      <RouterLink to="/tasks/new">Crie a primeira</RouterLink>
      para comecar.
    </p>
    <p v-else-if="dueTasks.length === 0">Nenhuma tarefa para este dia.</p>
    <p v-else-if="statusFilter === 'completed'">Nenhuma tarefa concluida neste dia.</p>
    <p v-else-if="statusFilter === 'pending'">Nenhuma tarefa pendente neste dia.</p>
    <p v-else>Nenhuma tarefa corresponde aos filtros.</p>
  </div>

  <p v-if="hiddenCount" class="hidden-note figure">
    {{ hiddenCount }} {{ hiddenCount === 1 ? 'tarefa oculta' : 'tarefas ocultas' }} neste dia.
  </p>

  <ConfirmDialog ref="confirmDialog" @confirm="handleDelete" />
</template>

<style scoped>
@reference "../../assets/main.css";

.dir {
  @apply flex items-center justify-center w-11 min-h-11 shrink-0 font-mono text-[0.875rem]
         text-fg-soft bg-well border border-line-strong cursor-pointer
         transition-[color,border-color] duration-[140ms];
  border-radius: var(--radius-sm);
}

.dir:hover {
  @apply text-fg border-accent-text;
}

.dir:focus-visible {
  @apply outline-none border-accent;
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

.empty {
  @apply mt-6 px-4 py-8 text-center bg-panel border border-dashed border-line-strong
         rounded-sm;
}

.hidden-note {
  @apply mt-3 text-[0.75rem] text-fg-faint;
}
</style>
