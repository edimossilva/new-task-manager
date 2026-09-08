<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Task } from '@/entities'
import {
  TIMES_PER_PERIOD_LABELS,
  formatDate,
  formatDateTime,
  formatPeriodLabel,
  periodKey,
} from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import CategoryBadge from '@/components/CategoryBadge.vue'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TaskStamp from '@/components/TaskStamp.vue'
import CompletionGauge from '@/components/CompletionGauge.vue'

const route = useRoute()
const store = useTaskStore()
const categoryStore = useCategoryStore()
const { referenceDate, today } = usePeriodSelection()

const task = ref<Task>()

function load() {
  task.value = store.getById(route.params.id as string)
}

onMounted(() => {
  categoryStore.loadAll()
  load()
})

// Reloading after every write: the repository serves from its cache, so this is
// a Map lookup, and the stamp below would otherwise render a stale count.
watch(
  () => store.tasks,
  () => load(),
)

const category = computed(() =>
  task.value?.categoryId ? categoryStore.byId.get(task.value.categoryId) : undefined,
)

const count = computed(() =>
  task.value ? store.completionCountFor(task.value, referenceDate.value) : 0,
)

/**
 * The periods this task was checked off in, newest first, each carrying its own
 * check-offs. Entries written before check-offs recorded a moment show the
 * period they belong to and nothing more, which is all those documents know.
 */
const history = computed(() => (task.value ? store.completionHistory(task.value) : []))

const totalChecks = computed(() =>
  history.value.reduce((sum, period) => sum + period.entries.length, 0),
)

/** The period being browsed, named the way the history names its own rows. */
const currentPeriodLabel = computed(() =>
  task.value ? periodLabel(periodKey(task.value.frequency, referenceDate.value)) : '',
)

function periodLabel(key: string): string {
  // The real today, not the browsed date, or an August key would read 'Hoje'
  // while browsing August.
  return task.value ? formatPeriodLabel(task.value.frequency, key, today.value) : key
}

function advance() {
  if (task.value) store.advanceCompletion(task.value.id, referenceDate.value)
}

function toggleActive() {
  if (task.value) store.setActive(task.value.id, !task.value.active)
}
</script>

<template>
  <p class="eyebrow">Tarefa</p>

  <template v-if="task">
    <header class="flex items-start justify-between gap-3 mb-5">
      <h1 class="!mb-0 min-w-0 break-words">{{ task.title }}</h1>
      <div class="flex shrink-0 gap-2">
        <!-- A word here, an icon in the list rows: this page has room to say it. -->
        <button type="button" class="btn btn-secondary" @click="toggleActive">
          {{ task.active ? 'Desativar' : 'Ativar' }}
        </button>
        <RouterLink :to="`/tasks/${task.id}/edit`" class="btn">Editar</RouterLink>
      </div>
    </header>

    <section class="sheet p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="!task.active" class="chip off">Inativa</span>
        <CategoryBadge v-if="category" :category="category" />
        <FrequencyBadge :frequency="task.frequency" />
        <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
        <span v-if="task.timesPerPeriod > 1" class="chip figure">
          {{ TIMES_PER_PERIOD_LABELS[task.frequency].toLowerCase() }}: {{ task.timesPerPeriod }}
        </span>
      </div>

      <p v-if="task.description" class="desc">{{ task.description }}</p>

      <!-- The current period, tickable from here: reading the history and
           finishing the period are the same visit often enough. -->
      <div class="now">
        <TaskStamp
          :task="task"
          :count="count"
          :period-label="formatDate(referenceDate)"
          :disabled="!task.active"
          @advance="advance"
        />
        <div class="min-w-0">
          <p class="now-label">{{ currentPeriodLabel }}</p>
          <CompletionGauge
            v-if="task.timesPerPeriod > 1"
            :count="count"
            :total="task.timesPerPeriod"
            class="mt-1"
            @set="(value) => store.setCompletionCount(task!.id, value, referenceDate)"
            @undo="store.undoCompletion(task!.id, referenceDate)"
          />
        </div>
      </div>

      <p class="meta figure">Criada em {{ formatDateTime(task.createdAt) }}</p>
    </section>

    <div class="flex items-baseline justify-between gap-3 mt-7 mb-1">
      <h2 class="!mb-0">Historico</h2>
      <span class="count figure">
        {{ totalChecks }} {{ totalChecks === 1 ? 'marcacao' : 'marcacoes' }}
      </span>
    </div>

    <p v-if="history.length === 0" class="section-empty">Nenhuma marcacao ainda.</p>

    <ol v-else class="log">
      <li v-for="period in history" :key="period.key" class="period">
        <div class="period-head">
          <span class="period-key">{{ periodLabel(period.key) }}</span>
          <span class="period-rule" aria-hidden="true"></span>
          <span class="period-count figure">{{ period.entries.length }}x</span>
        </div>
        <ul>
          <li v-for="(entry, index) in period.entries" :key="index" class="entry">
            <span class="entry-tick" aria-hidden="true"></span>
            <span v-if="entry.at" class="entry-at figure">{{ formatDateTime(entry.at) }}</span>
            <span v-else class="entry-unknown">Horario nao registrado</span>
          </li>
        </ul>
      </li>
    </ol>
  </template>

  <template v-else>
    <p class="error">Tarefa nao encontrada.</p>
    <RouterLink to="/tasks" class="btn btn-secondary">Voltar</RouterLink>
  </template>
</template>

<style scoped>
@reference "../../assets/main.css";

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-accent-text mb-1;
}

.chip {
  @apply inline-block px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-[0.1em]
         leading-[1.5] whitespace-nowrap text-fg-soft bg-well border border-line-strong
         rounded-[2px];
}

.chip.off {
  @apply text-fg-faint;
}

.desc {
  @apply mt-3 text-[0.9375rem] leading-relaxed text-fg-soft break-words;
}

.now {
  @apply flex items-center gap-3 mt-4 pt-4 border-t border-line;
}

.now-label {
  @apply font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-fg-faint;
}

.meta {
  @apply mt-4 text-[0.6875rem] text-fg-faint;
}

.count {
  @apply shrink-0 text-[0.8125rem] text-fg-faint;
}

.section-empty {
  @apply mt-1 text-[0.875rem] text-fg-faint;
}

.log {
  @apply mt-3;
}

.period {
  @apply px-4 py-3 mb-2 bg-panel border border-line-strong rounded-sm;
}

.period-head {
  @apply flex items-center gap-3 pb-2 border-b border-line;
}

.period-key {
  @apply shrink-0 font-mono text-[0.75rem] font-medium uppercase tracking-[0.14em] text-fg;
}

/* The rule carries the eye from a period's name to its tally, like a ledger. */
.period-rule {
  @apply flex-1 h-px;
  background: repeating-linear-gradient(90deg, var(--color-line-strong) 0 2px, transparent 2px 5px);
}

.period-count {
  @apply shrink-0 text-[0.75rem];
  color: var(--color-done);
}

.entry {
  @apply flex items-center gap-2.5 pt-2;
}

/* A struck tick per check-off: the count above is a number, this is the tally. */
.entry-tick {
  @apply w-1.5 h-1.5 shrink-0 rounded-full;
  background: var(--color-done);
  box-shadow: 0 0 6px var(--color-done-dim);
}

.entry-at {
  @apply text-[0.8125rem] text-fg-soft;
}

.entry-unknown {
  @apply text-[0.8125rem] text-fg-faint italic;
}
</style>
