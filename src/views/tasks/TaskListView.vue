<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Category, Task, TaskFrequency } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS, FREQUENCY_ORDER, INKS } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSortable } from '@/composables/use-sortable'
import { UNFILED } from '@/composables/use-category-rack'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CategoryBadge from '@/components/CategoryBadge.vue'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TaskRowActions from '@/components/TaskRowActions.vue'

/*
 * This page is the REGISTRY: every task the user has defined, listed once,
 * with nothing on it that depends on today. No period selector and no
 * completion state -- the browsed date belongs to the pages that check things
 * off (Hoje, the task's own page), and a template does not have a "done".
 * What it has is a title, a cadence, a category, a target and whether it is in
 * the routine, and every one of those is editable from here.
 */

/** Whether the task is part of the routine -- the only "state" a template has. */
type ActiveFilter = 'all' | 'active' | 'inactive'

const ACTIVE_TABS: { value: ActiveFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Ativas' },
  { value: 'inactive', label: 'Inativas' },
]

// Categoria leads: it is the key the page opens on.
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'category', label: 'Categoria' },
  { value: 'frequency', label: 'Frequencia' },
  { value: 'title', label: 'Titulo' },
  { value: 'times', label: 'Vezes' },
  { value: 'status', label: 'Situacao' },
]

const store = useTaskStore()
const categoryStore = useCategoryStore()

const frequencyFilter = ref<TaskFrequency | 'all'>('all')
const categoryFilter = ref<string>('all')
const activeFilter = ref<ActiveFilter>('all')

const confirmDialog = ref<InstanceType<typeof ConfirmDialog>>()
const pendingDeleteId = ref<string>()

/**
 * A task pointing at a category that is gone reads as unfiled, the same
 * fallback the rack makes: a task nothing renders is a task nobody can edit.
 */
function categoryOf(task: Task): Category | undefined {
  return task.categoryId ? categoryStore.byId.get(task.categoryId) : undefined
}

/**
 * The row wears its category's ink as a wash -- the same `dim` the rack unit's
 * head is painted with, so a category looks the same on both pages. Bound
 * inline from the ink table rather than through twenty CSS classes, the trade
 * every ink consumer in the app makes.
 *
 * An unfiled row binds nothing and keeps the plain ground; the `tinted` class
 * is what tells the two apart, so the untinted row keeps its ordinary hover
 * instead of a wash of a colour it does not have.
 */
function inkVars(task: Task) {
  const category = categoryOf(task)
  const ink = category ? INKS[category.ink] : undefined
  if (!ink) return undefined
  return { '--row-base': ink.base, '--row-dim': ink.dim }
}

// Everything except the routine tab, so the tab counts stay stable while it
// is switched -- the same relationship the filters and tabs had before.
const filteredTasks = computed(() =>
  store.tasks.filter((task) => {
    if (frequencyFilter.value !== 'all' && task.frequency !== frequencyFilter.value) return false
    if (categoryFilter.value === 'all') return true
    const category = categoryOf(task)
    return categoryFilter.value === UNFILED ? !category : category?.id === categoryFilter.value
  }),
)

const activeCounts = computed(() => ({
  all: filteredTasks.value.length,
  active: filteredTasks.value.filter((task) => task.active).length,
  inactive: filteredTasks.value.filter((task) => !task.active).length,
}))

const visibleTasks = computed(() =>
  filteredTasks.value.filter((task) => {
    if (activeFilter.value === 'active') return task.active
    if (activeFilter.value === 'inactive') return !task.active
    return true
  }),
)

/**
 * The base order every column sorts ON TOP OF: frequency, then title. Array
 * sort is stable, so whichever key is picked keeps this as its tie-break --
 * and the default `category` key therefore reads as the full
 * category -> frequency -> title ordering the page opens on, without a
 * multi-key comparator anywhere.
 */
const orderedTasks = computed(() =>
  [...visibleTasks.value].sort(
    (a, b) =>
      FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency] || a.title.localeCompare(b.title),
  ),
)

const { sortedItems, sortKey, sortAsc, sortBy, sortClass } = useSortable(
  orderedTasks,
  {
    title: (task) => task.title.toLowerCase(),
    // The ordinal, not the label, so Diaria comes before Semanal.
    frequency: (task) => FREQUENCY_ORDER[task.frequency],
    // Unfiled sorts last ascending, as it does in the rack. The sentinel is a
    // codepoint above every letter, so no real category name can outrank it.
    category: (task) => categoryOf(task)?.name.toLowerCase() ?? '\uffff',
    times: (task) => task.timesPerPeriod,
    // Ascending puts the routine first and what was switched off under it.
    status: (task) => (task.active ? 0 : 1),
  },
  { key: 'category' },
)

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
</script>

<template>
  <header class="flex items-start justify-between gap-3 mb-1">
    <h1 class="!mb-0">Tarefas</h1>
    <RouterLink to="/tasks/new" class="btn shrink-0">Nova</RouterLink>
  </header>

  <!-- The page says what it is for, because it is the one list that does not tick. -->
  <p class="page-note">
    Cadastro completo das tarefas. Para marcar o que foi feito, use
    <RouterLink to="/">Hoje</RouterLink>.
  </p>

  <p v-if="store.error" class="error">{{ store.error }}</p>

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
      <label for="category-filter">Categoria</label>
      <select id="category-filter" v-model="categoryFilter" class="select-compact">
        <option value="all">Todas</option>
        <option
          v-for="category in categoryStore.categories"
          :key="category.id"
          :value="category.id"
        >
          {{ category.name }}
        </option>
        <option :value="UNFILED">Sem categoria</option>
      </select>
    </div>
    <!--
      Only where the table is not: above md the column heads are the control,
      and two ways to sort the same rows is one too many.
    -->
    <div class="md:hidden">
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
      v-for="tab in ACTIVE_TABS"
      :key="tab.value"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="activeFilter === tab.value"
      @click="activeFilter = tab.value"
    >
      {{ tab.label }}
      <span class="tab-count">{{ activeCounts[tab.value] }}</span>
    </button>
  </div>

  <!-- Phones: the same six fields, stacked, since a six-column table is a
       horizontal scroll nobody wants on a 360px screen. -->
  <ul v-if="sortedItems.length" class="md:hidden mt-4">
    <li
      v-for="task in sortedItems"
      :key="task.id"
      class="card"
      :class="{ off: !task.active, tinted: !!categoryOf(task) }"
      :style="inkVars(task)"
    >
      <RouterLink :to="`/tasks/${task.id}`" class="card-title">{{ task.title }}</RouterLink>
      <p v-if="task.description" class="card-desc">{{ task.description }}</p>
      <div class="card-foot">
        <div class="tags">
          <FrequencyBadge :frequency="task.frequency" />
          <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
          <CategoryBadge v-if="categoryOf(task)" :category="categoryOf(task)!" />
          <span v-if="task.timesPerPeriod > 1" class="chip figure">
            {{ task.timesPerPeriod }}x
          </span>
          <span v-if="!task.active" class="chip">Inativa</span>
        </div>
        <TaskRowActions :task="task" class="-mr-1.5" @delete="confirmDelete" />
      </div>
    </li>
  </ul>

  <div v-if="sortedItems.length" class="hidden md:block overflow-x-auto">
    <table>
      <thead>
        <tr>
          <th :class="sortClass('title')" @click="sortBy('title')">Tarefa</th>
          <th :class="sortClass('frequency')" @click="sortBy('frequency')">Frequencia</th>
          <th :class="sortClass('category')" @click="sortBy('category')">Categoria</th>
          <th :class="sortClass('times')" @click="sortBy('times')">Vezes</th>
          <th :class="sortClass('status')" @click="sortBy('status')">Situacao</th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="task in sortedItems"
          :key="task.id"
          :class="{ off: !task.active, tinted: !!categoryOf(task) }"
          :style="inkVars(task)"
        >
          <td>
            <RouterLink :to="`/tasks/${task.id}`" class="row-title">{{ task.title }}</RouterLink>
            <p v-if="task.description" class="row-desc">{{ task.description }}</p>
          </td>
          <td>
            <div class="tags">
              <FrequencyBadge :frequency="task.frequency" />
              <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
            </div>
          </td>
          <td>
            <CategoryBadge v-if="categoryOf(task)" :category="categoryOf(task)!" />
            <span v-else class="text-fg-faint">-</span>
          </td>
          <!-- The target, not a tally: how many check-offs the period asks for. -->
          <td class="figure">{{ task.timesPerPeriod }}x</td>
          <td>
            <span class="chip" :class="{ on: task.active }">
              {{ task.active ? 'Ativa' : 'Inativa' }}
            </span>
          </td>
          <td>
            <TaskRowActions :task="task" class="-my-2" @delete="confirmDelete" />
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
    <p v-else>Nenhuma tarefa corresponde aos filtros.</p>
  </div>

  <ConfirmDialog ref="confirmDialog" @confirm="handleDelete" />
</template>

<style scoped>
@reference "../../assets/main.css";

.page-note {
  @apply mb-5 text-[0.75rem] text-fg-faint;
}

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

.card {
  @apply px-3.5 py-3 mb-2 bg-panel border border-line-strong rounded-sm;
}

/*
 * The wash goes on as an IMAGE rather than a colour: `dim` is a 12% ink, and
 * it has to composite over the panel rather than replace it.
 */
.card.tinted {
  background-image: linear-gradient(var(--row-dim), var(--row-dim));
  /* The hairline takes a trace of the same ink, as the rack unit's does. */
  border-color: color-mix(in srgb, var(--row-base) 26%, var(--color-line-strong));
}

/* A table row has the table's own panel under it, so the colour is enough. */
tbody tr.tinted {
  background-color: var(--row-dim);
}

tbody tr.tinted:hover {
  background-color: color-mix(in srgb, var(--row-base) 22%, transparent);
}

.card-title {
  @apply text-[0.9375rem] leading-snug font-medium text-fg no-underline;
}

.card-title:hover {
  @apply text-accent-text;
}

.card-desc {
  @apply mt-0.5 text-[0.8125rem] leading-snug text-fg-faint break-words;
}

.card-foot {
  @apply flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5;
}

.tags {
  @apply flex flex-wrap items-center gap-1.5;
}

.card-foot .tags {
  @apply flex-1 min-w-0;
}

.row-title {
  @apply text-[0.9375rem] leading-snug font-medium text-fg no-underline;
}

.row-title:hover {
  @apply text-accent-text;
}

.row-desc {
  @apply mt-0.5 max-w-[32rem] text-[0.8125rem] leading-snug text-fg-faint break-words;
}

/* Out of the routine: legible, but visibly not part of the running set. */
.off .card-title,
.off .card-desc,
.off .row-title,
.off .row-desc {
  @apply text-fg-faint;
}

.chip {
  @apply inline-block px-1.5 py-0.5 font-mono text-[0.625rem] font-medium uppercase
         tracking-[0.1em] leading-[1.5] whitespace-nowrap text-fg-faint bg-well
         border border-line-strong rounded-[2px];
}

.chip.on {
  @apply text-fg;
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line-strong));
}

.empty {
  @apply mt-6 px-4 py-8 text-center bg-panel border border-dashed border-line-strong
         rounded-sm;
}
</style>
