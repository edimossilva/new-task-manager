<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Category, Task } from '@/entities'
import { FREQUENCY_LABELS, FREQUENCY_ORDER, INKS, formatDateTime } from '@/entities'
import type { PeriodPoint, TaskInsight } from '@/usecases'
import { percentOf } from '@/usecases'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TaskInfoLink from '@/components/TaskInfoLink.vue'
import TaskRunChart from '@/components/TaskRunChart.vue'

/** Weeks on the trend. The same eight the summary reads, plus a month of room. */
const TREND_WEEKS = 12

const route = useRoute()
const store = useTaskStore()
const categoryStore = useCategoryStore()
const { today } = usePeriodSelection()

const category = ref<Category>()

function load() {
  category.value = categoryStore.getById(route.params.id as string)
}

onMounted(() => {
  store.loadAll()
  categoryStore.loadAll()
  load()
})

// The name and ink can change under the page, and every figure below reads the
// task list, which a check-off rewrites.
watch([() => categoryStore.categories, () => store.tasks], () => load())

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

const tasks = computed(() =>
  category.value ? store.tasks.filter((task) => task.categoryId === category.value!.id) : [],
)

const activeTasks = computed(() => tasks.value.filter((task) => task.active))

/**
 * One reading per task, the same one its own page opens with.
 *
 * This is what a CATEGORY page is for: a task's page answers "am I keeping
 * this", and only a page holding all of them can answer "which of these am I
 * keeping". Everything below is a fold of these rows.
 */
const insights = computed<{ task: Task; insight: TaskInsight }[]>(() =>
  tasks.value.map((task) => ({ task, insight: store.taskInsight(task) })),
)

/**
 * Adherence for the whole category, POOLED rather than averaged: periods done
 * over periods asked, across every task. An average of percentages would let a
 * yearly task with one period on the books weigh as much as a daily one with
 * three hundred, which is not what "how much of what this category asked for
 * got done" means.
 */
const adherence = computed(() =>
  insights.value.reduce(
    (tally, row) => ({
      done: tally.done + row.insight.periodsDone,
      total: tally.total + row.insight.periodsElapsed,
    }),
    { done: 0, total: 0 },
  ),
)

const totalChecks = computed(() => insights.value.reduce((sum, row) => sum + row.insight.total, 0))

/** The most recent check-off anywhere in the category, and what it was. */
const last = computed(() => {
  let best: { task: Task; at: Date; daysSince: number } | undefined
  for (const row of insights.value) {
    if (!row.insight.lastAt) continue
    if (!best || row.insight.lastAt > best.at) {
      best = { task: row.task, at: row.insight.lastAt, daysSince: row.insight.daysSince ?? 0 }
    }
  }
  return best
})

const sinceFigure = computed(() => {
  if (!last.value) return '--'
  if (last.value.daysSince === 0) return 'Hoje'
  if (last.value.daysSince === 1) return 'Ontem'
  return String(last.value.daysSince)
})

/**
 * The category's last twelve weeks, credited against what those weeks asked
 * of it -- the summary page's own measure, narrowed to these tasks.
 *
 * Fed to the task page's run chart by mapping a week onto a period: done is
 * the count, expected is the target. The two charts then speak one language,
 * and the bar semantics -- washed out when short, dashed while running -- come
 * out right without a second chart component.
 */
const trend = computed<PeriodPoint[]>(() =>
  store.weekTrend(tasks.value, today.value, TREND_WEEKS).map((point) => ({
    key: point.key,
    label: point.label,
    count: point.done,
    target: point.expected,
    isCurrent: point.isCurrent,
    existed: true,
  })),
)

/**
 * The window's own tally, CLOSED weeks only -- the running one has not been
 * asked for yet, and counting its check-offs against nothing would read
 * `40/37` on a good Sunday. The same figure the task page's chart carries.
 */
const trendTally = computed(() =>
  trend.value
    .filter((point) => !point.isCurrent)
    .reduce(
      (tally, point) => ({
        done: tally.done + Math.min(point.count, point.target),
        total: tally.total + point.target,
      }),
      { done: 0, total: 0 },
    ),
)

/** This week's reading, for the horizon lines. */
const week = computed(() => store.weekSummary(tasks.value, today.value))

/**
 * One line per horizon the category actually holds, in `FREQUENCIES` order.
 * A band's meter is this WEEK's credit, so the cadences a week cannot ask of
 * -- monthly, yearly, the one-offs -- carry a plain count instead of a ratio
 * they would always fail.
 */
const horizons = computed(() =>
  week.value.bands
    .map((band) => ({
      ...band,
      label: FREQUENCY_LABELS[band.frequency],
      count: tasks.value.filter((task) => task.frequency === band.frequency).length,
      percent: percentOf({ done: band.credited, total: band.expected }),
      ink: { '--band-ink': `var(--color-freq-${band.frequency})` },
    }))
    .filter((band) => band.count > 0)
    .sort((a, b) => FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency]),
)

/**
 * The tasks themselves, worst adherence first -- the order every list in this
 * app sorts by, for the same reason: what needs attention rises. Tasks out of
 * the routine sink under all of it; they are not a debt.
 */
const roll = computed(() =>
  [...insights.value].sort(
    (a, b) =>
      Number(a.task.active === false) - Number(b.task.active === false) ||
      a.insight.rate - b.insight.rate ||
      a.task.title.localeCompare(b.task.title),
  ),
)

function sinceLabel(insight: TaskInsight): string {
  if (insight.daysSince === undefined) return 'sem registro'
  if (insight.daysSince === 0) return 'hoje'
  if (insight.daysSince === 1) return 'ontem'
  return `ha ${insight.daysSince} dias`
}
</script>

<template>
  <template v-if="category">
    <RouterLink to="/categories" class="back">&larr; Categorias</RouterLink>

    <!-- The plate wears the category's own ink, as its rack unit does. -->
    <section class="plate" :style="inkVars">
      <header class="plate-head">
        <div class="min-w-0 order-first">
          <p class="eyebrow">Categoria</p>
          <h1 class="plate-title ink-text">{{ category.name }}</h1>
        </div>
        <div class="flex shrink-0 gap-2">
          <RouterLink :to="{ path: '/tasks/new', query: { category: category.id } }" class="btn">
            Nova tarefa
          </RouterLink>
          <RouterLink :to="`/categories/${category.id}/edit`" class="btn btn-secondary">
            Editar
          </RouterLink>
        </div>
      </header>

      <div class="plate-body">
        <p v-if="category.description" class="desc">{{ category.description }}</p>
        <p v-else class="desc muted">Sem descricao.</p>
      </div>
    </section>

    <section class="cluster" aria-label="Indicadores">
      <article class="tile" :style="{ '--i': 0 }">
        <p class="tile-label">Tarefas</p>
        <p class="tile-figure">{{ activeTasks.length }}</p>
        <p class="tile-sub figure">
          <template v-if="activeTasks.length === tasks.length">todas ativas</template>
          <template v-else
            >de {{ tasks.length }}, {{ tasks.length - activeTasks.length }} fora</template
          >
        </p>
      </article>

      <article class="tile" :style="{ '--i': 1 }">
        <p class="tile-label">Aproveitamento</p>
        <p class="tile-figure">{{ percentOf(adherence) }}<span class="tile-unit">%</span></p>
        <p class="tile-sub figure">{{ adherence.done }}/{{ adherence.total }} periodos</p>
        <div class="tile-track" aria-hidden="true">
          <div class="tile-fill" :style="{ width: `${percentOf(adherence)}%` }"></div>
        </div>
      </article>

      <article class="tile" :style="{ '--i': 2 }">
        <p class="tile-label">Marcacoes</p>
        <p class="tile-figure">{{ totalChecks }}</p>
        <p class="tile-sub figure">{{ week.routine.done }} nesta semana</p>
      </article>

      <article class="tile" :style="{ '--i': 3 }">
        <p class="tile-label">Ultima</p>
        <p class="tile-figure">
          {{ sinceFigure }}<span v-if="last && last.daysSince > 1" class="tile-unit">dias</span>
        </p>
        <p class="tile-sub figure">
          {{ last ? formatDateTime(last.at) : 'sem registro' }}
        </p>
      </article>
    </section>

    <template v-if="tasks.length">
      <!-- The category across TIME. A week is the only period every cadence in
           it shares, which is why this page counts in weeks and its tasks'
           pages count in their own periods. -->
      <section class="sheet block">
        <div class="block-head">
          <h2 class="block-title">Ultimas {{ TREND_WEEKS }} semanas</h2>
          <span v-if="trendTally.total" class="block-figure figure">
            {{ trendTally.done }}<span class="slash">/</span>{{ trendTally.total }}
          </span>
        </div>
        <TaskRunChart :points="trend" />
        <p class="foot">Marcacoes creditadas contra o que a semana pediu.</p>
      </section>

      <!-- The category across HORIZONS: the same axis home stacks its bands on. -->
      <section class="sheet block">
        <div class="block-head">
          <h2 class="block-title">Horizontes</h2>
          <span class="block-figure figure">{{ tasks.length }} tarefas</span>
        </div>
        <ul class="lines">
          <li v-for="band in horizons" :key="band.frequency" class="line" :style="band.ink">
            <span class="line-name">{{ band.label }}</span>
            <span class="line-count figure">{{ band.count }}</span>
            <!-- A cadence a week cannot ask of gets a dashed gap, not an empty
                 meter: a hatched track reading zero is a claim of failure, and
                 nothing was asked of a monthly task this Tuesday. -->
            <span v-if="band.expected" class="line-track">
              <span class="line-fill" :style="{ width: `${band.percent}%` }"></span>
            </span>
            <span v-else class="line-void" aria-hidden="true"></span>
            <span class="line-figure figure">
              <template v-if="band.expected">
                {{ band.credited }}<span class="slash">/</span>{{ band.expected }}
              </template>
              <template v-else>{{ band.done }}</template>
            </span>
          </li>
        </ul>
        <p class="foot">Medidores da semana; mensais e anuais mostram so o volume.</p>
      </section>

      <!-- The reading only this page can give: the tasks against each other. -->
      <div class="flex items-baseline justify-between gap-3 mt-7 mb-2">
        <h2 class="!mb-0">Tarefas</h2>
        <span class="count figure">pior aproveitamento primeiro</span>
      </div>

      <ul class="roll">
        <li
          v-for="row in roll"
          :key="row.task.id"
          class="roll-row"
          :class="{ off: !row.task.active }"
        >
          <div class="min-w-0 flex-1">
            <div class="roll-head">
              <RouterLink :to="`/tasks/${row.task.id}`" class="roll-link">
                {{ row.task.title }}
              </RouterLink>
              <FrequencyBadge :frequency="row.task.frequency" />
              <WeekdayBadge v-if="row.task.weekday" :weekday="row.task.weekday" />
              <span v-if="!row.task.active" class="roll-off">Inativa</span>
            </div>

            <div class="roll-meter">
              <span class="roll-track">
                <span class="roll-fill" :style="{ width: `${row.insight.rate}%` }"></span>
              </span>
              <span class="roll-pct figure">{{ row.insight.rate }}%</span>
              <span class="roll-meta figure">
                <!-- A one-off has no cadence, so no run of periods to be on. -->
                <template v-if="row.task.frequency !== 'once'">
                  seq {{ row.insight.streak }} &middot;
                </template>
                {{ sinceLabel(row.insight) }}
              </span>
            </div>
          </div>

          <TaskInfoLink :task="row.task" class="-my-2 -mr-1.5" />
        </li>
      </ul>
    </template>

    <div v-else class="empty">
      <p>
        Nenhuma tarefa nesta categoria.
        <RouterLink :to="{ path: '/tasks/new', query: { category: category.id } }">
          Crie a primeira
        </RouterLink>
        para comecar a medir.
      </p>
    </div>
  </template>

  <template v-else>
    <p class="error">Categoria nao encontrada.</p>
    <RouterLink to="/categories" class="btn btn-secondary">Voltar</RouterLink>
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

/* Stacked on a phone: two action buttons are most of a 388px line, and a name
   squeezed into what is left breaks one word per row. */
.plate-head {
  @apply flex flex-col items-stretch gap-3 px-4 pt-3.5 pb-3
         sm:flex-row sm:items-start sm:justify-between sm:px-5;
  background: linear-gradient(90deg, var(--cat-dim), transparent 70%);
}

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-fg-faint mb-1;
}

.plate-title {
  @apply !mb-0 min-w-0 break-words text-[1.5rem] sm:text-[1.75rem];
}

.plate-body {
  @apply px-4 pb-4 sm:px-5 sm:pb-5;
}

.desc {
  @apply text-[0.9375rem] leading-relaxed text-fg-soft break-words;
}

.desc.muted {
  @apply text-fg-faint italic;
}

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

.tile-sub {
  @apply mt-1.5 text-[0.625rem] leading-snug uppercase tracking-[0.06em] text-fg-faint;
}

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
  background: var(--cat-base, var(--color-done));
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
  @apply shrink-0 text-[0.75rem] text-fg-faint;
}

.foot {
  @apply mt-2.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-fg-faint;
}

/* A horizon as one ruled line: name, count, meter, figure. */
.lines {
  @apply flex flex-col gap-2;
}

.line {
  @apply flex items-center gap-3;
}

.line-name {
  @apply w-16 shrink-0 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] truncate;
  color: var(--band-ink);
}

.line-count {
  @apply w-5 shrink-0 text-[0.75rem] text-fg-faint text-right;
}

.line-track {
  @apply relative flex-1 h-2.5 border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.line-fill {
  @apply block h-full;
  background: var(--band-ink);
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.line-void {
  @apply flex-1 h-px;
  background: repeating-linear-gradient(90deg, var(--color-line-strong) 0 3px, transparent 3px 7px);
}

.line-figure {
  @apply w-14 shrink-0 text-right text-[0.75rem] text-fg-soft;
}

.slash {
  @apply text-fg-faint mx-px;
}

.count {
  @apply shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-fg-faint;
}

.roll-row {
  @apply flex items-start gap-3 px-3.5 py-2.5 mb-2 bg-panel border border-line-strong;
  border-radius: var(--radius-sm);
}

.roll-row.off {
  @apply opacity-60;
}

.roll-head {
  @apply flex flex-wrap items-center gap-x-2 gap-y-1;
}

.roll-link {
  @apply text-[0.9375rem] leading-snug font-medium text-fg no-underline;
}

.roll-link:hover {
  @apply text-accent-text;
}

.roll-off {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-fg-faint bg-well border border-line-strong px-1.5 py-0.5 rounded-[2px];
}

.roll-meter {
  @apply flex items-center gap-2 mt-1.5;
}

.roll-track {
  @apply relative w-24 h-1.5 shrink-0 border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.roll-fill {
  @apply block h-full;
  background: var(--color-done);
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.roll-pct {
  @apply w-9 shrink-0 text-[0.75rem] text-fg-soft;
}

.roll-meta {
  @apply text-[0.625rem] uppercase tracking-[0.06em] text-fg-faint truncate;
}

.empty {
  @apply mt-6 px-4 py-8 text-center bg-panel border border-dashed border-line-strong
         rounded-sm;
}

@keyframes tile-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
