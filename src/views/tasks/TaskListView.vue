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
import { usePeriodSelection } from '@/composables/use-period-selection'
import { useSortable } from '@/composables/use-sortable'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'
import TaskCheckbox from '@/components/TaskCheckbox.vue'

type StatusFilter = 'all' | 'pending' | 'completed'

const store = useTaskStore()
const { referenceDate, today } = usePeriodSelection()

const frequencyFilter = ref<TaskFrequency | 'all'>('all')
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

const filteredTasks = computed(() =>
  store.tasks.filter((task) => {
    if (!store.existsIn(task, referenceDate.value)) return false
    if (frequencyFilter.value !== 'all' && task.frequency !== frequencyFilter.value) return false
    if (statusFilter.value === 'pending') return !isCompleted(task)
    if (statusFilter.value === 'completed') return isCompleted(task)
    return true
  }),
)

const { sortedItems, sortBy, sortClass } = useSortable(filteredTasks, {
  title: (task) => task.title.toLowerCase(),
  // Sort on the ordinal, not the label, so Diaria comes before Semanal.
  frequency: (task) => FREQUENCY_ORDER[task.frequency],
  status: (task) => (isCompleted(task) ? 1 : 0),
  lastCompletion: (task) => lastCompletionKey(task) ?? '',
})

onMounted(() => store.loadAll())

function confirmDelete(id: string) {
  pendingDeleteId.value = id
  confirmDialog.value?.open()
}

function handleDelete() {
  if (pendingDeleteId.value) store.remove(pendingDeleteId.value)
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
  <div class="flex items-center justify-between mb-6">
    <h1 class="!mb-0">Tarefas</h1>
    <RouterLink to="/tasks/new" class="btn">Nova Tarefa</RouterLink>
  </div>

  <p v-if="store.error" class="error">{{ store.error }}</p>

  <PeriodSelector v-if="store.tasks.length" />

  <div v-if="store.tasks.length" class="flex flex-wrap items-end gap-4 mb-2">
    <div>
      <label for="frequency-filter">Frequencia</label>
      <select
        id="frequency-filter"
        v-model="frequencyFilter"
        class="!w-auto !py-1 !px-2 text-[0.8125rem]"
      >
        <option value="all">Todas</option>
        <option v-for="frequency in FREQUENCIES" :key="frequency" :value="frequency">
          {{ FREQUENCY_LABELS[frequency] }}
        </option>
      </select>
    </div>
    <div>
      <label for="status-filter">Situacao</label>
      <select
        id="status-filter"
        v-model="statusFilter"
        class="!w-auto !py-1 !px-2 text-[0.8125rem]"
      >
        <option value="all">Todas</option>
        <option value="pending">Pendentes</option>
        <option value="completed">Concluidas</option>
      </select>
    </div>
  </div>

  <table v-if="sortedItems.length">
    <thead>
      <tr>
        <th class="w-10"><span class="sr-only">Concluir</span></th>
        <th :class="sortClass('title')" @click="sortBy('title')">Titulo</th>
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
          <TaskCheckbox
            :task="task"
            :completed="isCompleted(task)"
            :period-label="formatDate(referenceDate)"
            @toggle="store.toggleCompletion(task.id, referenceDate)"
          />
        </td>
        <td :class="{ 'line-through text-text-muted': isCompleted(task) }">
          {{ task.title }}
          <span v-if="task.description" class="block text-xs text-text-muted">
            {{ task.description }}
          </span>
        </td>
        <td><FrequencyBadge :frequency="task.frequency" /></td>
        <td>{{ isCompleted(task) ? 'Concluida' : 'Pendente' }}</td>
        <td>{{ lastCompletion(task) }}</td>
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
  <p v-else-if="store.tasks.length">Nenhuma tarefa corresponde aos filtros.</p>
  <p v-else>Nenhuma tarefa cadastrada.</p>

  <ConfirmDialog ref="confirmDialog" @confirm="handleDelete" />
</template>
