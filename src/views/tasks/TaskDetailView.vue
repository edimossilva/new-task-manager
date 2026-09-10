<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Task } from '@/entities'
import {
  INKS,
  PERIOD_NOUNS,
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
import TaskRunChart from '@/components/TaskRunChart.vue'
import TaskHeatmap from '@/components/TaskHeatmap.vue'
import TaskRhythm from '@/components/TaskRhythm.vue'

/** Periods shown in the log before it asks to be opened. */
const LOG_PAGE = 8

const route = useRoute()
const store = useTaskStore()
const categoryStore = useCategoryStore()
const { referenceDate, today } = usePeriodSelection()

const task = ref<Task>()
const showAllPeriods = ref(false)

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

/*
 * The page wears its category's ink, the way the rack unit does: a rail down
 * the plate and a wash across its head. Bound inline from the ink table, the
 * trade every ink consumer in the app makes.
 */
const inkVars = computed(() => {
  const ink = category.value ? INKS[category.value.ink] : undefined
  if (!ink) return {}
  return {
    '--cat-base': ink.base,
    '--cat-deep': ink.deep,
    '--cat-bright': ink.bright,
    '--cat-dim': ink.dim,
  }
})

const count = computed(() =>
  task.value ? store.completionCountFor(task.value, referenceDate.value) : 0,
)

/**
 * The whole reading of the task's past: streaks, adherence, the run chart, the
 * heatmap and the rhythms. One call, one pass over the check-offs.
 */
const insight = computed(() => (task.value ? store.taskInsight(task.value) : undefined))

/**
 * The periods this task was checked off in, newest first, each carrying its own
 * check-offs. Entries written before check-offs recorded a moment show the
 * period they belong to and nothing more, which is all those documents know.
 */
const history = computed(() => (task.value ? store.completionHistory(task.value) : []))

const visibleHistory = computed(() =>
  showAllPeriods.value ? history.value : history.value.slice(0, LOG_PAGE),
)

/** A one-off has a single period, and it is the current one: no cadence to read. */
const hasCadence = computed(() => task.value !== undefined && task.value.frequency !== 'once')

/** The noun a figure counting THIS task's periods wears. */
function periods(value: number): string {
  if (!task.value) return ''
  const noun = PERIOD_NOUNS[task.value.frequency]
  return value === 1 ? noun.one : noun.many
}

/**
 * The window the run chart covers, as its own tally. CLOSED periods only, on
 * both sides of the slash: the running one has not been asked for yet, and
 * counting its checks against nothing would read `14/13` on a good day.
 */
const windowTally = computed(() =>
  (insight.value?.timeline ?? [])
    .filter((point) => point.existed && !point.isCurrent)
    .reduce(
      (tally, point) => ({
        done: tally.done + Math.min(point.count, point.target),
        total: tally.total + point.target,
      }),
      { done: 0, total: 0 },
    ),
)

/** `Hoje` / `Ontem` / `12`, the figure the last-check-off tile leads with. */
const sinceFigure = computed(() => {
  const days = insight.value?.daysSince
  if (days === undefined) return '--'
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return String(days)
})

const sinceUnit = computed(() => {
  const days = insight.value?.daysSince
  return days === undefined || days <= 1 ? '' : 'dias atras'
})

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
  <template v-if="task && insight">
    <RouterLink to="/tasks" class="back">&larr; Tarefas</RouterLink>

    <!--
      The plate: the task's identity, its current period, and nothing that has
      to be computed from its past. Everything below this is the past.
    -->
    <section class="plate" :class="{ unfiled: !category, off: !task.active }" :style="inkVars">
      <header class="plate-head">
        <div class="min-w-0 order-first">
          <p class="eyebrow ink-text">{{ category?.name ?? 'Sem categoria' }}</p>
          <h1 class="plate-title">{{ task.title }}</h1>
        </div>
        <div class="flex shrink-0 gap-2">
          <!-- A word here, an icon in the list rows: this page has room to say it. -->
          <button type="button" class="btn btn-secondary" @click="toggleActive">
            {{ task.active ? 'Desativar' : 'Ativar' }}
          </button>
          <RouterLink :to="`/tasks/${task.id}/edit`" class="btn">Editar</RouterLink>
        </div>
      </header>

      <div class="plate-body">
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
          <div class="min-w-0 flex-1">
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
      </div>
    </section>

    <!--
      The instrument cluster. Four readings, each a different question: am I
      keeping it, how well have I kept it, how much is there, and when did I
      last touch it.
    -->
    <section class="cluster" aria-label="Indicadores">
      <article v-if="hasCadence" class="tile" :style="{ '--i': 0 }">
        <p class="tile-label">Sequencia</p>
        <p class="tile-figure">
          {{ insight.streak }}<span class="tile-unit">{{ periods(insight.streak) }}</span>
        </p>
        <p class="tile-sub figure">melhor: {{ insight.bestStreak }}</p>
      </article>

      <article v-if="hasCadence" class="tile" :style="{ '--i': 1 }">
        <p class="tile-label">Aproveitamento</p>
        <p class="tile-figure">{{ insight.rate }}<span class="tile-unit">%</span></p>
        <p class="tile-sub figure">
          {{ insight.periodsDone }}/{{ insight.periodsElapsed }}
          {{ periods(insight.periodsElapsed) }}
        </p>
        <div class="tile-track" aria-hidden="true">
          <div class="tile-fill" :style="{ width: `${insight.rate}%` }"></div>
        </div>
      </article>

      <article class="tile" :style="{ '--i': 2 }">
        <p class="tile-label">Marcacoes</p>
        <p class="tile-figure">{{ insight.total }}</p>
        <!-- Keys left by a frequency change are real work, counted apart: the
             figures above measure the cadence the task has NOW. -->
        <p v-if="insight.total > insight.counted" class="tile-sub figure">
          {{ insight.total - insight.counted }} fora da cadencia
        </p>
        <p v-else class="tile-sub figure">em {{ history.length }} {{ periods(history.length) }}</p>
      </article>

      <article class="tile" :style="{ '--i': 3 }">
        <p class="tile-label">Ultima</p>
        <p class="tile-figure">
          {{ sinceFigure }}<span v-if="sinceUnit" class="tile-unit">{{ sinceUnit }}</span>
        </p>
        <p class="tile-sub figure">
          {{ insight.lastAt ? formatDateTime(insight.lastAt) : 'sem registro' }}
        </p>
      </article>
    </section>

    <!-- WHAT HAPPENED, period by period. The bars are counts against the
         task's own target, so a repeat task is read on its own scale. -->
    <section v-if="hasCadence" class="sheet block">
      <div class="block-head">
        <h2 class="block-title">
          Ultimos {{ insight.timeline.length }} {{ periods(insight.timeline.length) }}
        </h2>
        <span v-if="windowTally.total > 0" class="block-figure figure">
          {{ windowTally.done }}<span class="slash">/</span>{{ windowTally.total }}
        </span>
      </div>
      <TaskRunChart :points="insight.timeline" />
    </section>

    <!-- A season of days, for the one cadence that owns every day. -->
    <section v-if="insight.heat.length" class="sheet block">
      <div class="block-head">
        <h2 class="block-title">Ultimas {{ insight.heat.length / 7 }} semanas</h2>
        <span class="legend" aria-hidden="true">
          <span class="legend-label">menos</span>
          <span class="legend-cell l0"></span>
          <span class="legend-cell l1"></span>
          <span class="legend-cell l2"></span>
          <span class="legend-cell l3"></span>
          <span class="legend-label">mais</span>
        </span>
      </div>
      <TaskHeatmap :cells="insight.heat" />
    </section>

    <!-- WHEN the work actually happens, which the periods above cannot say. -->
    <section class="sheet block">
      <div class="block-head">
        <h2 class="block-title">Ritmo</h2>
      </div>
      <TaskRhythm
        :by-weekday="insight.byWeekday"
        :by-hour="insight.byHour"
        :dated="insight.dated"
      />
    </section>

    <div class="flex items-baseline justify-between gap-3 mt-7 mb-1">
      <h2 class="!mb-0">Historico</h2>
      <span class="count figure">
        {{ insight.total }} {{ insight.total === 1 ? 'marcacao' : 'marcacoes' }}
      </span>
    </div>

    <p v-if="history.length === 0" class="section-empty">Nenhuma marcacao ainda.</p>

    <ol v-else class="log">
      <li v-for="period in visibleHistory" :key="period.key" class="period">
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

    <!-- A log of four hundred periods is a page nobody scrolls; the recent ones
         are what a visit is usually about. -->
    <button
      v-if="history.length > LOG_PAGE"
      type="button"
      class="more"
      @click="showAllPeriods = !showAllPeriods"
    >
      {{ showAllPeriods ? 'Mostrar menos' : `Ver todos os ${history.length} periodos` }}
    </button>
  </template>

  <template v-else>
    <p class="error">Tarefa nao encontrada.</p>
    <RouterLink to="/tasks" class="btn btn-secondary">Voltar</RouterLink>
  </template>
</template>

<style scoped>
@reference "../../assets/main.css";

.back {
  @apply inline-block mb-3 font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em]
         text-fg-faint no-underline transition-colors duration-[140ms];
}

.back:hover {
  @apply text-accent-text;
}

/* The plate: the same ink language the rack unit wears, at page scale. */
.plate {
  @apply relative overflow-hidden pl-3 bg-panel border;
  border-color: color-mix(in srgb, var(--cat-base, transparent) 26%, var(--color-line-strong));
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
}

.plate::before {
  content: '';
  @apply absolute left-0 top-0 bottom-0 w-[3px];
  background: var(--cat-base);
  box-shadow: 0 0 12px var(--cat-dim);
}

/* Nothing filed here, so the rail is drawn as a gap in the line. */
.plate.unfiled::before {
  background: repeating-linear-gradient(
    180deg,
    var(--color-line-strong) 0 5px,
    transparent 5px 10px
  );
  box-shadow: none;
}

/* Stacked on a phone: the two action buttons are 215px of a 388px line, and a
   title squeezed into what is left breaks one word per row. */
.plate-head {
  @apply flex flex-col items-stretch gap-3 px-4 pt-3.5 pb-3
         sm:flex-row sm:items-start sm:justify-between sm:px-5;
  background: linear-gradient(90deg, var(--cat-dim), transparent 70%);
}

.plate.unfiled .plate-head {
  background: none;
}

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] mb-1 truncate;
}

.plate.unfiled .eyebrow {
  @apply text-fg-faint;
}

.plate-title {
  @apply !mb-0 min-w-0 break-words text-[1.5rem] sm:text-[1.75rem];
}

.plate.off .plate-title {
  @apply text-fg-faint;
}

.plate-body {
  @apply px-4 pb-4 sm:px-5 sm:pb-5;
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
  @apply mt-3 text-[0.6875rem] text-fg-faint;
}

/* The instrument cluster: four readings, sized to be read at a glance. */
.cluster {
  @apply grid grid-cols-2 gap-2.5 mt-3 sm:grid-cols-4;
}

.tile {
  @apply relative overflow-hidden px-3.5 py-3 bg-panel border border-line;
  border-radius: var(--radius-sm);
  box-shadow: var(--panel-shadow);
  animation: tile-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i) * 60ms);
}

.tile-label {
  @apply font-mono text-[0.5625rem] font-medium uppercase tracking-[0.16em] text-fg-faint;
}

.tile-figure {
  @apply mt-1 font-display text-[1.75rem] leading-none font-semibold text-fg tabular-nums;
}

.tile-unit {
  @apply ml-1 font-mono text-[0.6875rem] font-normal uppercase tracking-[0.1em] text-fg-faint;
}

/* Wraps rather than truncates: it is the line that says WHY the figure above
   it reads the way it does, and half of that is worse than two lines of it. */
.tile-sub {
  @apply mt-1.5 text-[0.625rem] leading-snug uppercase tracking-[0.06em] text-fg-faint;
}

/* Only the adherence tile carries a meter: it is the only figure that is a
   ratio, and a bar under a raw count would be a bar with no scale. */
.tile-track {
  @apply relative h-[3px] mt-2 overflow-hidden;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 3px,
    var(--color-line-strong) 3px 4px
  );
}

.tile-fill {
  @apply h-full;
  background: var(--color-done);
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.block {
  @apply p-3.5 mt-3 sm:p-4;
}

.block-head {
  @apply flex items-baseline justify-between gap-3 mb-3;
}

.block-title {
  @apply !mb-0 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-fg-soft;
}

.block-figure {
  @apply shrink-0 text-[0.8125rem] text-fg-soft;
}

.slash {
  @apply text-fg-faint mx-px;
}

.legend {
  @apply flex shrink-0 items-center gap-1;
}

.legend-label {
  @apply font-mono text-[0.5rem] uppercase tracking-[0.1em] text-fg-faint;
}

.legend-cell {
  @apply block w-2 h-2;
  border-radius: 1px;
  background-color: var(--color-well);
  background-image: repeating-linear-gradient(45deg, transparent 0 2px, var(--color-line) 2px 3px);
}

.legend-cell.l1 {
  background-color: color-mix(in srgb, var(--color-done) 28%, var(--color-well));
  background-image: none;
}

.legend-cell.l2 {
  background-color: color-mix(in srgb, var(--color-done) 55%, var(--color-well));
  background-image: none;
}

.legend-cell.l3 {
  background-color: var(--color-done);
  background-image: none;
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

.more {
  @apply w-full min-h-11 mt-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em]
         text-fg-faint bg-transparent border border-dashed border-line-strong cursor-pointer
         transition-colors duration-[140ms];
  border-radius: var(--radius-sm);
}

.more:hover {
  @apply text-accent-text border-accent-text;
}

@keyframes tile-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
