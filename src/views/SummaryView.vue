<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Weekday } from '@/entities'
import {
  FREQUENCY_LABELS,
  INKS,
  WEEKDAY_SHORT,
  formatWeekRange,
  isSameDay,
  isoWeekKey,
  parseDailyKey,
  periodKey,
  weekDates,
  weekStart,
} from '@/entities'
import type { WeekTaskRow, WeekTrendPoint } from '@/usecases'
import { percentOf } from '@/usecases'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodStore } from '@/stores/period-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import { buildCategoryRack } from '@/composables/use-category-rack'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'

const store = useTaskStore()
const categoryStore = useCategoryStore()
const periodStore = usePeriodStore()
const { referenceDate, today } = usePeriodSelection()

onMounted(() => {
  store.loadAll()
  categoryStore.loadAll()
})

/**
 * The focused week's Monday, held as a KEY first.
 *
 * The clock ticks every sixty seconds and `referenceDate` follows it whenever
 * nothing is pinned, so a computed reading the Date itself would rebuild the
 * whole summary once a minute. A computed whose value is an unchanged string
 * does not dirty its dependents, so keying on the day makes the aggregation
 * re-run when the DAY turns over -- and stepping Tuesday to Wednesday inside one
 * week is free, since the Monday does not move.
 */
const mondayKey = computed(() => periodKey('daily', weekStart(referenceDate.value)))
const monday = computed(() => parseDailyKey(mondayKey.value) ?? weekStart(referenceDate.value))

const summary = computed(() => store.weekSummary(store.tasks, monday.value))
const trend = computed(() => store.weekTrend(store.tasks, monday.value))

/** The real week, not the browsed one: the label has to compare against today. */
const currentKey = computed(() => isoWeekKey(today.value))
const isCurrentWeek = computed(() => summary.value.key === currentKey.value)
/**
 * Week keys are zero-padded and week-year led, so a plain string compare is
 * chronological -- across the year boundary included (2025-W52 < 2026-W01).
 */
const isFutureWeek = computed(() => summary.value.key > currentKey.value)

const routinePercent = computed(() => percentOf(summary.value.routine))
const hasAnything = computed(
  () =>
    summary.value.routine.total > 0 || summary.value.routine.done > 0 || summary.value.extras > 0,
)

function stepWeek(weeks: number): void {
  periodStore.step(weeks * 7)
}

function canStepWeek(weeks: number): boolean {
  return periodStore.canStep(weeks * 7)
}

function canFocus(point: WeekTrendPoint): boolean {
  return periodStore.contains(point.start)
}

function focusWeek(point: WeekTrendPoint): void {
  // Tapping the current week resumes following the clock instead of pinning its
  // Monday, so stepping away and back is a true round trip -- the rule `step`
  // already applies a day at a time.
  if (point.isCurrent) periodStore.clear()
  else periodStore.setDate(point.start)
}

/** The bars are a ratio, so an empty week is an empty bar rather than a gap. */
function pointPercent(point: WeekTrendPoint): number {
  return percentOf({ done: point.done, total: point.expected })
}

/**
 * The horizons with something to say, `FREQUENCIES` order, empty ones dropped --
 * the home page's rule. The meter reads credited work; the count reads volume,
 * which is the only figure a monthly or yearly band has.
 */
const bands = computed(() =>
  summary.value.bands
    .filter((band) => band.done > 0 || band.expected > 0)
    .map((band) => ({
      ...band,
      label: FREQUENCY_LABELS[band.frequency],
      percent: percentOf({ done: band.credited, total: band.expected }),
      ink: { '--band-ink': `var(--color-freq-${band.frequency})` },
    })),
)

/**
 * Seg..Dom.
 *
 * Every bar is drawn on ONE scale -- the tallest thing in the week, done or
 * asked for -- so the seven are comparable and the target notch sits at the
 * height it means. Scaling each bar to its own day would make a 2/2 day look
 * like a 9/9 one.
 *
 * The day's demand is the DAILIES' and nothing else, which is why the strip's
 * totals do not add up to the week's: a weekly, monthly or yearly target belongs
 * to a span of days, not to one of them.
 */
const weekdays = computed(() => {
  const done = summary.value.byWeekday
  const asked = summary.value.expectedByWeekday
  const scale = Math.max(1, ...done, ...asked)
  const todayKey = periodKey('daily', today.value)
  return weekDates(monday.value).map((date, index) => {
    const count = done[index] ?? 0
    const expected = asked[index] ?? 0
    return {
      date,
      label: WEEKDAY_SHORT[(index + 1) as Weekday],
      done: count,
      expected,
      percent: (count / scale) * 100,
      notch: (expected / scale) * 100,
      short: expected > count,
      isToday: isSameDay(date, today.value),
      isFuture: periodKey('daily', date) > todayKey,
    }
  })
})

/** The strip's own total, so the block can state the scale it is drawn on. */
const dayTotals = computed(() => ({
  done: summary.value.byWeekday.reduce((sum, count) => sum + count, 0),
  expected: summary.value.expectedByWeekday.reduce((sum, count) => sum + count, 0),
}))

/** A task with nothing expected and nothing recorded has nothing to say here. */
const rows = computed(() => summary.value.rows.filter((row) => row.done > 0 || row.expected > 0))

/**
 * One unit per category, grouped by the rack's own function: the cards ARE the
 * categories on both list pages, and this block is the same axis. Only the
 * tasks this week touched or asked for are grouped, so an untouched category
 * does not take up a slot in the wall.
 */
const units = computed(() => {
  const byTask = new Map(summary.value.rows.map((row) => [row.task.id, row]))
  return buildCategoryRack(
    rows.value.map((row) => row.task),
    categoryStore.categories,
  ).map((unit) => {
    const tally = unit.tasks.reduce(
      (sum, task) => {
        const row = byTask.get(task.id)
        return {
          done: sum.done + (row?.done ?? 0),
          credited: sum.credited + (row?.credited ?? 0),
          expected: sum.expected + (row?.expected ?? 0),
        }
      },
      { done: 0, credited: 0, expected: 0 },
    )
    const ink = unit.category ? INKS[unit.category.ink] : undefined
    return {
      ...unit,
      ...tally,
      percent: percentOf({ done: tally.credited, total: tally.expected }),
      inkVars: ink
        ? {
            '--cat-base': ink.base,
            '--cat-deep': ink.deep,
            '--cat-bright': ink.bright,
            '--cat-dim': ink.dim,
          }
        : {},
    }
  })
})

type Outcome = 'missed' | 'partial' | 'finished' | 'extra'

/** Missed first: the roll-call is read for what slipped, not for what worked. */
const OUTCOME_ORDER: Record<Outcome, number> = { missed: 0, partial: 1, finished: 2, extra: 3 }
const OUTCOME_LABELS: Record<Outcome, string> = {
  missed: 'Nao feita',
  partial: 'Parcial',
  finished: 'Concluida',
  extra: 'Extra',
}

/**
 * `extra` is a task the week asked nothing of that was checked off anyway -- a
 * one-off finished, a monthly ticked, a task out of the routine. Real work, and
 * the reason it sits outside the ratio is exactly that nothing was expected.
 */
function outcomeOf(row: WeekTaskRow): Outcome {
  if (row.expected === 0) return 'extra'
  if (row.credited >= row.expected) return 'finished'
  return row.credited > 0 ? 'partial' : 'missed'
}

const roll = computed(() =>
  rows.value
    .map((row) => ({ row, outcome: outcomeOf(row) }))
    .sort(
      (a, b) =>
        OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] ||
        a.row.task.title.localeCompare(b.row.task.title),
    ),
)
</script>

<template>
  <p class="eyebrow">Resumo</p>

  <header class="flex items-start justify-between gap-3 mb-5">
    <div class="min-w-0">
      <h1 class="!mb-0 truncate">{{ isCurrentWeek ? 'Esta semana' : summary.key }}</h1>
      <p class="range figure">{{ formatWeekRange(monday) }}</p>
    </div>

    <!-- A week-scoped control, not the day selector: this page's unit is the week. -->
    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="arrow"
        :disabled="!canStepWeek(-1)"
        aria-label="Semana anterior"
        @click="stepWeek(-1)"
      >
        &lsaquo;
      </button>
      <button
        type="button"
        class="arrow"
        :disabled="!canStepWeek(1)"
        aria-label="Semana seguinte"
        @click="stepWeek(1)"
      >
        &rsaquo;
      </button>
      <button
        type="button"
        class="today-btn"
        :disabled="isCurrentWeek"
        @click="periodStore.clear()"
      >
        Atual
      </button>
    </div>
  </header>

  <template v-if="store.tasks.length">
    <!--
      The weeks before this one, oldest left. The bars are the same ratio the
      block below reads, so a bar and the page it jumps to cannot disagree.
    -->
    <section class="sheet trend" aria-label="Ultimas semanas">
      <ol class="bars">
        <li v-for="point in trend" :key="point.key" class="bar-slot">
          <button
            type="button"
            class="bar"
            :class="{
              focused: point.key === summary.key,
              current: point.isCurrent,
              empty: point.expected === 0,
            }"
            :disabled="!canFocus(point)"
            :aria-current="point.key === summary.key ? 'true' : undefined"
            :title="`${point.key}: ${point.done}/${point.expected} marcacoes${point.extras ? ` (+${point.extras})` : ''}`"
            @click="focusWeek(point)"
          >
            <span class="bar-track">
              <span class="bar-fill" :style="{ height: `${pointPercent(point)}%` }"></span>
            </span>
            <span class="bar-label figure">{{ point.label }}</span>
          </button>
        </li>
      </ol>
    </section>

    <p v-if="isFutureWeek" class="note">Semana futura: nada foi cobrado ainda.</p>

    <!-- The routine's reading: what the week asked for, and what happened. -->
    <section class="sheet block" aria-label="Rotina da semana">
      <div class="block-head">
        <span class="block-label">Rotina da semana</span>
        <span class="block-pct figure">{{ routinePercent }}%</span>
      </div>
      <p class="figure total">
        {{ summary.routine.done }}<span class="slash">/</span>{{ summary.routine.total }}
        <span class="total-unit">marcacoes</span>
      </p>
      <div class="track">
        <div class="fill" :style="{ width: `${routinePercent}%` }"></div>
      </div>
      <!--
        The status of the routine, then the work that sat outside it: a finished
        week should still be told it finished, whatever else happened in it.
      -->
      <p class="foot figure">
        <template v-if="summary.routine.total === 0">Nada cobrado nesta semana</template>
        <template v-else-if="routinePercent === 100">Rotina completa</template>
        <template v-else>{{ summary.routine.total - summary.routine.done }} em aberto</template>
        <template v-if="summary.extras"> &middot; + {{ summary.extras }} fora da rotina </template>
      </p>
    </section>

    <template v-if="hasAnything">
      <!-- Where the week's work fell. Only what pins to a day appears here. -->
      <h2 class="section-title">Dias</h2>
      <section class="sheet block" aria-label="Marcacoes por dia">
        <div class="block-head">
          <span class="block-label">Marcacoes por dia</span>
          <span class="block-pct figure">
            {{ dayTotals.done }}<span class="slash">/</span>{{ dayTotals.expected }}
          </span>
        </div>
        <ol class="days">
          <li
            v-for="day in weekdays"
            :key="day.label"
            class="day"
            :class="{ today: day.isToday, ahead: day.isFuture }"
          >
            <!--
              The notch is the day's own target, drawn on the shared scale: the
              fill reaching it is the whole reading, and a bar past it is a day
              that carried more than its share.
            -->
            <span class="day-bar" :title="`${day.label}: ${day.done} de ${day.expected} marcacoes`">
              <span
                class="day-fill"
                :class="{ short: day.short }"
                :style="{ height: `${day.percent}%` }"
              ></span>
              <span
                v-if="day.expected"
                class="day-notch"
                :style="{ bottom: `${day.notch}%` }"
                aria-hidden="true"
              ></span>
            </span>
            <span class="day-count figure">
              {{ day.done
              }}<template v-if="day.expected"
                ><span class="slash">/</span>{{ day.expected }}</template
              >
            </span>
            <span class="day-label">{{ day.label }}</span>
          </li>
        </ol>
        <p class="foot figure">
          <template v-if="summary.undated"
            >{{ summary.undated }} sem dia definido &middot;
          </template>
          Metas diarias apenas
        </p>
      </section>

      <!-- One row per horizon, tinted with its own ink, as the home bands are. -->
      <h2 class="section-title">Horizontes</h2>
      <ul class="lines">
        <li v-for="band in bands" :key="band.frequency" class="line" :style="band.ink">
          <span class="line-name band-name">{{ band.label }}</span>
          <span class="line-track band-track">
            <span class="line-fill band-fill" :style="{ width: `${band.percent}%` }"></span>
          </span>
          <span class="line-figure figure">
            <template v-if="band.expected">
              {{ band.credited }}<span class="slash">/</span>{{ band.expected }}
            </template>
            <template v-else>{{ band.done }}</template>
          </span>
        </li>
      </ul>

      <!-- The same axis the two list pages rack up, read for the week. -->
      <h2 class="section-title">Categorias</h2>
      <div class="rack">
        <article
          v-for="unit in units"
          :key="unit.key"
          class="unit"
          :class="{ unfiled: !unit.category }"
          :style="unit.inkVars"
        >
          <header class="unit-head">
            <h3 class="unit-name ink-text">{{ unit.category?.name ?? 'Sem categoria' }}</h3>
            <span class="unit-count figure">
              <template v-if="unit.expected">
                {{ unit.credited }}<span class="slash">/</span>{{ unit.expected }}
              </template>
              <template v-else>{{ unit.done }}</template>
            </span>
          </header>
          <div v-if="unit.expected" class="unit-track" aria-hidden="true">
            <div class="unit-fill" :style="{ width: `${unit.percent}%` }"></div>
          </div>
        </article>
      </div>

      <!-- The tasks themselves, what slipped at the top. -->
      <h2 class="section-title">Tarefas</h2>
      <ul class="roll">
        <li v-for="item in roll" :key="item.row.task.id" class="roll-row">
          <span class="mark" :class="item.outcome" aria-hidden="true"></span>
          <div class="min-w-0 flex-1">
            <p class="roll-title">
              <RouterLink :to="`/tasks/${item.row.task.id}`" class="roll-link">
                {{ item.row.task.title }}
              </RouterLink>
            </p>
            <div class="roll-tags">
              <FrequencyBadge :frequency="item.row.task.frequency" />
              <WeekdayBadge v-if="item.row.task.weekday" :weekday="item.row.task.weekday" />
              <span v-if="!item.row.task.active" class="roll-off">Inativa</span>
              <span class="roll-outcome" :class="item.outcome">
                {{ OUTCOME_LABELS[item.outcome] }}
              </span>
            </div>
          </div>
          <span class="roll-figure figure">
            <template v-if="item.row.expected">
              {{ item.row.credited }}<span class="slash">/</span>{{ item.row.expected }}
            </template>
            <template v-else>{{ item.row.done }}</template>
          </span>
        </li>
      </ul>
    </template>

    <p v-else class="section-empty">Nenhuma marcacao nesta semana.</p>

    <!--
      What the page cannot claim, said rather than papered over: the targets are
      today's, and a deleted task took its check-offs with it.
    -->
    <footer class="notes figure">
      <p v-if="summary.unplaced">
        {{ summary.unplaced }} marcacoes antigas sem data, fora de qualquer semana.
      </p>
      <p>Metas contadas pelas configuracoes atuais. Tarefas excluidas nao aparecem.</p>
    </footer>
  </template>

  <div v-else class="empty">
    <p class="empty-line">Nada para resumir ainda.</p>
    <RouterLink to="/tasks/new" class="btn mt-4">Criar a primeira tarefa</RouterLink>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-accent-text mb-1;
}

.range {
  @apply mt-0.5 text-[0.8125rem] text-fg-faint;
}

/* The week arrows and the reset key, borrowed from the day selector's dial. */
.arrow {
  @apply flex items-center justify-center w-11 h-11 shrink-0 font-display text-[1.25rem]
         leading-none text-fg-soft bg-transparent border border-transparent cursor-pointer
         transition-colors duration-[140ms];
  border-radius: var(--radius-sm);
  -webkit-tap-highlight-color: transparent;
}

.arrow:hover:not(:disabled) {
  @apply text-fg bg-well border-line-strong;
}

.arrow:disabled {
  @apply opacity-25 cursor-default;
}

.today-btn {
  @apply min-h-9 px-2.5 font-mono text-[0.625rem] font-medium uppercase tracking-[0.12em]
         text-fg bg-transparent border border-fg cursor-pointer whitespace-nowrap
         transition-colors duration-[140ms];
  border-radius: var(--radius-sm);
}

.today-btn:disabled {
  @apply text-fg-faint border-line-strong cursor-default;
}

.note {
  @apply mt-3 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-fg-faint;
}

.trend {
  @apply p-3;
}

.bars {
  @apply flex items-end gap-1.5;
}

.bar-slot {
  @apply flex-1 min-w-0;
}

.bar {
  @apply flex w-full flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-0
         text-fg-faint transition-colors duration-[140ms];
  -webkit-tap-highlight-color: transparent;
}

.bar:disabled {
  @apply opacity-30 cursor-default;
}

/* Hatched, so a week with nothing done still reads as a scale and not a hole. */
.bar-track {
  @apply relative flex w-full h-14 items-end border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.bar-fill {
  @apply w-full;
  background: var(--color-fg-soft);
  transition: height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.bar.focused .bar-track {
  @apply border-accent;
}

.bar.focused .bar-fill {
  background: var(--color-accent);
  box-shadow: 0 0 12px var(--color-accent-dim);
}

.bar.focused,
.bar:hover:not(:disabled) {
  @apply text-accent-text;
}

/* The week still running: an unfinished week is not a shortfall. */
.bar.current .bar-track {
  border-style: dashed;
}

.bar-label {
  @apply text-[0.5625rem] uppercase tracking-[0.08em];
}

.block {
  @apply mt-3 px-3.5 py-3;
}

.block-head {
  @apply flex items-baseline justify-between gap-2;
}

.block-label {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em] text-accent-text;
}

.block-pct {
  @apply shrink-0 text-[0.75rem] text-fg-faint;
}

.total {
  @apply mt-1 text-[1.75rem] leading-none font-medium text-fg;
}

.total-unit {
  @apply ml-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-fg-faint;
}

.slash {
  @apply text-fg-faint mx-0.5;
}

.track {
  @apply relative h-2 w-full mt-2.5 border border-fg overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.fill {
  @apply h-full transition-[width] duration-500;
  background: var(--color-accent);
}

.foot {
  @apply mt-2 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-fg-faint;
}

.section-title {
  @apply !mb-2 mt-7 font-mono text-[0.75rem] font-medium uppercase tracking-[0.18em] text-fg-soft;
}

.section-empty {
  @apply mt-4 text-[0.875rem] text-fg-faint;
}

/* The weekday strip: seven columns, always, so the week keeps its shape. */
.days {
  @apply grid grid-cols-7 gap-1.5 items-end;
}

.day {
  @apply flex flex-col items-center gap-1;
}

.day-bar {
  @apply relative flex w-full h-12 items-end border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.day-fill {
  @apply w-full;
  background: var(--color-done);
  transition: height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.day.today .day-bar {
  @apply border-accent;
}

.day.ahead .day-bar {
  @apply opacity-40;
}

.day-count {
  @apply text-[0.6875rem] text-fg;
}

/* The day's target on the shared scale. A hairline, not a second bar: it is a
   reference the fill is read against, not a quantity of its own. */
.day-notch {
  @apply absolute left-0 right-0 h-px;
  background: var(--color-fg);
}

/* Short of its own target: the fill says so before the figures are read. */
.day-fill.short {
  background: color-mix(in srgb, var(--color-done) 55%, var(--color-void));
}

.day-label {
  @apply font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-fg-faint;
}

.day.today .day-label {
  @apply text-accent-text;
}

/* A horizon or a category as one ruled line: name, meter, figure. */
.lines {
  @apply flex flex-col gap-2;
}

.line {
  @apply flex items-center gap-3;
}

.line-name {
  @apply w-20 shrink-0 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] truncate;
}

.band-name {
  color: var(--band-ink);
}

.line-track {
  @apply relative flex-1 h-2.5 border border-line-strong overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.line-fill {
  @apply block h-full;
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.band-fill {
  background: var(--band-ink);
}

.line-figure {
  @apply w-16 shrink-0 text-right text-[0.75rem] text-fg-soft;
}

/* A category unit, cut down to its head and its meter: this page reads, it
   does not tick anything off. */
.unit {
  @apply relative overflow-hidden mb-3 pl-3 pb-3 bg-panel border;
  border-color: color-mix(in srgb, var(--cat-base, transparent) 26%, var(--color-line-strong));
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
  break-inside: avoid;
}

.unit::before {
  content: '';
  @apply absolute left-0 top-0 bottom-0 w-[3px];
  background: var(--cat-base);
  box-shadow: 0 0 12px var(--cat-dim);
}

.unit.unfiled::before {
  background: repeating-linear-gradient(
    180deg,
    var(--color-line-strong) 0 5px,
    transparent 5px 10px
  );
  box-shadow: none;
}

.unit-head {
  @apply flex items-baseline justify-between gap-3 px-3.5 pt-3 pb-2;
  background: linear-gradient(90deg, var(--cat-dim), transparent 70%);
}

.unit.unfiled .unit-head {
  background: none;
}

.unit-name {
  @apply !mb-0 font-display text-[0.9375rem] font-semibold uppercase tracking-[0.1em] truncate;
}

.unit.unfiled .unit-name {
  @apply text-fg-faint;
}

.unit-count {
  @apply shrink-0 text-[0.8125rem] text-fg-soft;
}

.unit-track {
  @apply relative h-[3px] mx-3.5 overflow-hidden;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 3px,
    var(--color-line-strong) 3px 4px
  );
}

.unit-fill {
  @apply h-full;
  background: var(--cat-base);
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.unit.unfiled .unit-fill {
  background: var(--color-fg-faint);
}

/* The roll-call. One mark per outcome, in the status colours the app already
   uses: alarm for missed, done for finished, accent for everything between. */
.roll {
  @apply flex flex-col;
}

.roll-row {
  @apply flex items-start gap-3 py-2.5 border-b border-line;
}

.roll-row:last-child {
  @apply border-b-0;
}

.mark {
  @apply w-1.5 h-1.5 mt-1.5 shrink-0 rounded-full;
}

.mark.missed {
  background: var(--color-alarm);
  box-shadow: 0 0 6px var(--color-alarm-dim);
}

.mark.partial {
  background: var(--color-accent);
}

.mark.finished {
  background: var(--color-done);
  box-shadow: 0 0 6px var(--color-done-dim);
}

.mark.extra {
  background: var(--color-fg-faint);
}

.roll-title {
  @apply text-[0.9375rem] leading-snug font-medium text-fg break-words;
}

.roll-link {
  @apply text-fg no-underline transition-colors duration-[140ms];
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
}

.roll-link:hover {
  @apply text-accent-text;
  text-decoration-color: currentColor;
}

.roll-tags {
  @apply flex flex-wrap items-center gap-1.5 mt-1;
}

.roll-off,
.roll-outcome {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-fg-faint bg-well border border-line-strong px-1.5 py-0.5 rounded-[2px];
}

.roll-outcome.missed {
  color: var(--color-alarm);
  border-color: var(--color-alarm);
  background: var(--color-alarm-dim);
}

.roll-outcome.finished {
  color: var(--color-done);
  border-color: var(--color-done);
  background: var(--color-done-dim);
}

.roll-outcome.partial {
  @apply text-accent-text border-accent-text bg-accent-dim;
}

.roll-figure {
  @apply shrink-0 text-[0.8125rem] text-fg-soft;
}

.notes {
  @apply mt-7 pt-3 text-[0.625rem] leading-relaxed text-fg-faint border-t border-line;
}

.empty {
  @apply flex flex-col items-center mt-10 px-5 py-10 text-center
         bg-panel border border-dashed border-line-strong rounded-sm;
}

.empty-line {
  @apply font-display text-[1.25rem] font-semibold text-fg;
}

@media (prefers-reduced-motion: reduce) {
  .bar-fill,
  .day-fill,
  .line-fill,
  .unit-fill,
  .fill {
    transition: none;
  }
}
</style>
