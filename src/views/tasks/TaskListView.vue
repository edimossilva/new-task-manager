<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Task, TaskFrequency } from '@/entities'
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  FREQUENCY_ORDER,
  formatDate,
  formatPeriodLabel,
  matchesFrequency,
} from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import { useSortable } from '@/composables/use-sortable'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CategoryBadge from '@/components/CategoryBadge.vue'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'
import TaskStamp from '@/components/TaskStamp.vue'

type StatusFilter = 'all' | 'pending' | 'completed'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'completed', label: 'Concluidas' },
]

const store = useTaskStore()
const categoryStore = useCategoryStore()
const { referenceDate, today } = usePeriodSelection()

const frequencyFilter = ref<TaskFrequency | 'all'>('all')
const categoryFilter = ref<string>('all')
const statusFilter = ref<StatusFilter>('all')

const confirmDialog = ref<InstanceType<typeof ConfirmDialog>>()
const pendingDeleteId = ref<string>()

/**
 * The latest completion written under the task's CURRENT frequency.
 *
 * A frequency change leaves keys of the old format behind, and mixed formats do
 * not sort chronologically -- within one year a weekly key outsorts every daily
 * key -- so the raw last element can be a stale key from the old format.
 */
function lastCompletionKey(task: Task): string | undefined {
  const own = task.completions.filter((key) => matchesFrequency(task.frequency, key))
  return own[own.length - 1]
}

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
    if (frequencyFilter.value !== 'all' && task.frequency !== frequencyFilter.value) return false
    if (categoryFilter.value === 'none' && task.categoryId) return false
    if (categoryFilter.value !== 'all' && categoryFilter.value !== 'none') {
      if (task.categoryId !== categoryFilter.value) return false
    }
    return true
  }),
)

function categoryOf(task: Task) {
  return task.categoryId ? categoryStore.byId.get(task.categoryId) : undefined
}

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

const { sortedItems, sortBy, sortClass } = useSortable(filteredTasks, {
  title: (task) => task.title.toLowerCase(),
  // Sort on the ordinal, not the label, so Diaria comes before Semanal.
  frequency: (task) => FREQUENCY_ORDER[task.frequency],
  // Uncategorised sorts last ascending rather than first.
  category: (task) => categoryOf(task)?.name.toLowerCase() ?? '\uffff',
  // Ascending puts what needs attention first: Atrasada, Pendente, Concluida.
  status: (task) => (isCompleted(task) ? 2 : isLate(task) ? 0 : 1),
  lastCompletion: (task) => lastCompletionKey(task) ?? '',
})

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

function situacao(task: Task): string {
  if (isCompleted(task)) return 'Concluida'
  return isLate(task) ? 'Atrasada' : 'Pendente'
}

function lastCompletion(task: Task): string {
  const key = lastCompletionKey(task)
  if (!key) return '-'
  // The real today, not the browsed date: otherwise an August key would be
  // labelled 'Hoje' while browsing August.
  return formatPeriodLabel(task.frequency, key, today.value)
}
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
    <div v-if="categoryStore.categories.length">
      <label for="category-filter">Categoria</label>
      <select id="category-filter" v-model="categoryFilter" class="select-compact">
        <option value="all">Todas</option>
        <option v-for="option in categoryStore.categories" :key="option.id" :value="option.id">
          {{ option.name }}
        </option>
        <option value="none">Sem categoria</option>
      </select>
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

  <!--
    Phones get cards, md+ gets the sortable table. Six columns cannot be read on
    a 390px screen, and column sorting has no affordance without headers.
  -->
  <TransitionGroup v-if="sortedItems.length" tag="ul" name="card" class="relative md:hidden mt-3">
    <li v-for="task in sortedItems" :key="task.id" class="card">
      <TaskStamp
        :task="task"
        :completed="isCompleted(task)"
        :period-label="formatDate(referenceDate)"
        @toggle="store.toggleCompletion(task.id, referenceDate)"
      />
      <div class="min-w-0 flex-1">
        <CategoryBadge v-if="categoryOf(task)" :category="categoryOf(task)!" class="mb-0.5" />
        <p class="card-title" :class="{ struck: isCompleted(task) }">{{ task.title }}</p>
        <p v-if="task.description" class="card-desc">{{ task.description }}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
          <FrequencyBadge :frequency="task.frequency" />
          <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
          <span v-if="isLate(task)" class="card-late">Atrasada</span>
          <span class="card-meta figure">{{ lastCompletion(task) }}</span>
        </div>
      </div>
      <div class="flex flex-col items-end shrink-0 -my-1">
        <RouterLink :to="`/tasks/${task.id}/edit`" class="btn-link">Editar</RouterLink>
        <button type="button" class="btn-link danger" @click="confirmDelete(task.id)">
          Excluir
        </button>
      </div>
    </li>
  </TransitionGroup>

  <div v-if="sortedItems.length" class="hidden md:block overflow-x-auto">
    <table>
      <thead>
        <tr>
          <th class="w-10"><span class="sr-only">Concluir</span></th>
          <th :class="sortClass('title')" @click="sortBy('title')">Titulo</th>
          <th :class="sortClass('category')" @click="sortBy('category')">Categoria</th>
          <th :class="sortClass('frequency')" @click="sortBy('frequency')">Frequencia</th>
          <th :class="sortClass('status')" @click="sortBy('status')">Situacao</th>
          <th :class="sortClass('lastCompletion')" @click="sortBy('lastCompletion')">
            Ultima conclusao
          </th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="task in sortedItems" :key="task.id">
          <td>
            <TaskStamp
              :task="task"
              :completed="isCompleted(task)"
              :period-label="formatDate(referenceDate)"
              @toggle="store.toggleCompletion(task.id, referenceDate)"
            />
          </td>
          <td :class="{ 'text-ink-faint line-through': isCompleted(task) }">
            <span class="text-ink">{{ task.title }}</span>
            <span v-if="task.description" class="block text-xs text-ink-faint">
              {{ task.description }}
            </span>
          </td>
          <td>
            <CategoryBadge v-if="categoryOf(task)" :category="categoryOf(task)!" />
            <span v-else class="text-ink-faint">-</span>
          </td>
          <td>
            <div class="flex items-center gap-1.5">
              <FrequencyBadge :frequency="task.frequency" />
              <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
            </div>
          </td>
          <td :class="isLate(task) ? 'text-accent-deep font-semibold' : ''">
            {{ situacao(task) }}
          </td>
          <td class="figure text-[0.8125rem]">{{ lastCompletion(task) }}</td>
          <td>
            <div class="actions">
              <RouterLink :to="`/tasks/${task.id}/edit`" class="btn-link">Editar</RouterLink>
              <button type="button" class="btn-link danger" @click="confirmDelete(task.id)">
                Excluir
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
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

.card {
  @apply flex items-start gap-3 px-3.5 py-3 mb-2 bg-paper-raised
         border border-rule-strong rounded-sm;
}

.card-title {
  @apply text-[0.9375rem] leading-snug font-medium text-ink break-words;
}
.card-title.struck {
  @apply text-ink-faint line-through decoration-[1.5px];
  text-decoration-color: var(--color-moss);
}

.card-desc {
  @apply mt-0.5 text-[0.8125rem] leading-snug text-ink-faint break-words;
}

.card-late {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-paper bg-accent-deep px-1.5 py-0.5 rounded-[2px];
}

.card-meta {
  @apply text-[0.6875rem] text-ink-faint;
}

.empty {
  @apply mt-6 px-4 py-8 text-center bg-paper-raised border border-dashed border-rule-strong
         rounded-sm;
}

.hidden-note {
  @apply mt-3 text-[0.75rem] text-ink-faint;
}

.card-enter-active,
.card-leave-active,
.card-move {
  transition:
    opacity 180ms ease,
    transform 240ms cubic-bezier(0.34, 1.3, 0.64, 1);
}
.card-enter-from {
  opacity: 0;
  transform: translateY(0.5rem);
}
.card-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
.card-leave-active {
  @apply absolute;
}
</style>
