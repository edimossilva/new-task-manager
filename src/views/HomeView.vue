<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Task, TaskFrequency, Weekday } from '@/entities'
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  TURN_LABELS,
  WEEKDAY_SHORT,
  addWeeks,
  formatDate,
  formatWeekRange,
  parseDailyKey,
  periodKey,
  turnOf,
  weekDates,
  weekStart,
} from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodStore } from '@/stores/period-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import { buildCategoryRack } from '@/composables/use-category-rack'
import type { WeekdayLoad } from '@/usecases'
import { percentOf } from '@/usecases'
import CategoryTaskCard from '@/components/CategoryTaskCard.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'
import type { CurvePoint } from '@/components/TrendCurve.vue'
import TrendCurve from '@/components/TrendCurve.vue'

const authStore = useAuthStore()
const store = useTaskStore()
const categoryStore = useCategoryStore()
const periodStore = usePeriodStore()
const { referenceDate, today, isToday } = usePeriodSelection()

onMounted(() => {
  store.loadAll()
  categoryStore.loadAll()
})

function isCompleted(task: Task): boolean {
  return store.isCompletedFor(task, referenceDate.value)
}

// Only ACTIVE tasks actually due on the browsed date: ones created later never
// had a chance to be done, a weekly task pinned to a weekday has not come up
// yet, and an inactive one is not part of the routine at all.
const visibleTasks = computed(() =>
  store.tasks.filter((task) => task.active && store.isDueOn(task, referenceDate.value)),
)

/**
 * What the clock says about each task, resolved ONCE per render. Both questions
 * walk a task's check-offs, and the sort below calls its comparator O(n log n)
 * times -- asking inside it would re-walk the same completions every comparison.
 *
 * `today` is the clock rather than `referenceDate`, so a turn passing re-sorts
 * the band on the tick even with a day pinned. See `CategoryTaskCard`.
 *
 * `isLateOn` rather than `turnState.late`, because it also carries the weekly
 * task's weekday rule, which has nothing to do with turns.
 */
const turnCensus = computed(() => {
  const late = new Set<string>()
  const current = new Set<string>()

  for (const task of visibleTasks.value) {
    if (store.isLateOn(task, referenceDate.value, today.value)) late.add(task.id)
    // The two sets deliberately OVERLAP. A task whose morning was missed and
    // whose afternoon is running is honestly in both -- 'what did I miss' and
    // 'what is due now' are different questions, and it is the answer to each.
    if (
      task.frequency === 'daily' &&
      store.turnState(task, referenceDate.value, today.value).current.length
    ) {
      current.add(task.id)
    }
  }

  return { late, current }
})

const lateCount = computed(() => turnCensus.value.late.size)
const nowCount = computed(() => turnCensus.value.current.size)

/** The turn the clock is in, and only while the browsed day is today. */
const runningTurn = computed(() => (isToday.value ? turnOf(today.value) : undefined))

/**
 * Atrasada, then what the running turn is asking for, then the rest of what is
 * pending, then done. The sort carries the same message the rails do: what you
 * missed on top, what you should be doing right now under it.
 */
function statusRank(task: Task): number {
  if (isCompleted(task)) return 3
  if (turnCensus.value.late.has(task.id)) return 0
  return turnCensus.value.current.has(task.id) ? 1 : 2
}

/**
 * A card holds its whole category within its band, so the sort carries what the
 * Pendentes / Concluidas split used to say: what needs attention rises, what is
 * done sinks under it. No frequency term -- a band is one frequency.
 */
const sortedTasks = computed(() =>
  [...visibleTasks.value].sort(
    (a, b) => statusRank(a) - statusRank(b) || a.title.localeCompare(b.title),
  ),
)

/**
 * One band per frequency, `FREQUENCIES` order: Diaria on top, Anual at the
 * bottom. Each holds its own rack, so a category with a daily and a monthly
 * task appears once per band -- the band is the outer axis, the category the
 * inner. Bands with nothing due are dropped rather than shown empty.
 */
const bands = computed(() =>
  FREQUENCIES.map((frequency) => {
    const tasks = sortedTasks.value.filter((task) => task.frequency === frequency)
    // The reading is check-level: a task wanting eight check-offs is eight
    // notches on the scale, so the third one moves the needle instead of the
    // band sitting at zero until the whole task lands. At timesPerPeriod 1 this
    // is the task count it always was.
    const checks = store.checkTally(tasks, referenceDate.value)
    return {
      frequency,
      label: FREQUENCY_LABELS[frequency],
      done: checks.done,
      total: checks.total,
      percent: percentOf(checks),
      // Whole tasks, the other reading: eight of eight checks on one task and
      // one of eight on eight tasks are the same percentage and not the same day.
      tasks: { done: tasks.filter(isCompleted).length, total: tasks.length },
      hasRepeats: tasks.some((task) => task.timesPerPeriod > 1),
      // Which horizon is actually in trouble: a count in the band head says it
      // where the gauge above can only say how much is left.
      late: tasks.filter((task) => turnCensus.value.late.has(task.id)).length,
      // The rule takes the frequency's own ink, then burns off.
      ink: { '--band-ink': `var(--color-freq-${frequency})` },
      // The rows themselves, for `shownBands` to rack up. The rack is built
      // there rather than here because a lit readout filters the rows, and a
      // band's own READINGS above -- the gauge, the head, the late count --
      // are the whole horizon's whatever is on screen.
      items: tasks,
    }
  }).filter((band) => band.tasks.total > 0),
)

/** Whether the Para agora readout is on the page at all. */
const nowLit = computed(() => Boolean(runningTurn.value && nowCount.value))

/**
 * The week the browsed day sits in, held as a KEY first.
 *
 * The clock ticks every sixty seconds and `referenceDate` follows it whenever
 * nothing is pinned, so a computed reading the Date itself would walk every
 * task's check-offs once a minute. A computed whose value is an unchanged
 * string does not dirty its dependents, so this re-runs when the DAY turns over
 * -- and stepping Tuesday to Wednesday inside one week is free, since the
 * Monday does not move.
 */
const dayKey = computed(() => periodKey('daily', referenceDate.value))
const mondayKey = computed(() => periodKey('daily', weekStart(referenceDate.value)))
const monday = computed(() => parseDailyKey(mondayKey.value) ?? weekStart(referenceDate.value))

/**
 * One curve per cadence, both of them laid out over the SAME seven days.
 *
 * A daily task and a weekly one are asked for on different horizons, and a
 * single line counting both against one demand is two readings in one stroke --
 * but WHEN the work happened is a question both can answer, and answering it on
 * one axis is what lets the two curves be read against each other.
 */
const dailyLoad = computed(() => store.weekdayLoad(store.tasks, monday.value, 'daily'))
const weeklyLoad = computed(() => store.weekdayLoad(store.tasks, monday.value, 'weekly'))

/**
 * The same reading one week back, which is the only comparison a single week
 * can offer and the one the curve cannot draw. It is the figure the curve
 * PLOTS, so the chip and the line under it are counting the same thing.
 */
const lastMonday = computed(() => addWeeks(monday.value, -1))
const previousDaily = computed(() => store.weekdayLoad(store.tasks, lastMonday.value, 'daily'))
const previousWeekly = computed(() => store.weekdayLoad(store.tasks, lastMonday.value, 'weekly'))

const weekRange = computed(() => formatWeekRange(monday.value))

const weeklyTasks = computed(() => store.tasks.filter((task) => task.frequency === 'weekly'))

/**
 * The seven days of the browsed week, as a curve draws them.
 *
 * `cumulative` turns the columns into a RUN: each point carries the totals
 * through that day rather than the day's own figures, which is the only honest
 * way to draw a cadence whose period is the WEEK -- a weekly task owes nothing
 * to Tuesday, but the week is half gone by Wednesday night.
 */
function buildPoints(load: WeekdayLoad, cumulative = false): CurvePoint[] {
  const todayKey = periodKey('daily', today.value)
  let running = 0
  return weekDates(monday.value).map((date, index) => {
    const key = periodKey('daily', date)
    running += load.done[index] ?? 0
    return {
      label: WEEKDAY_SHORT[(index + 1) as Weekday],
      done: cumulative ? running : (load.done[index] ?? 0),
      // The pace is fractional wherever a target belongs to no single day, and
      // a check-off is not: `ceil`, so the column says the count it takes to be
      // on the line rather than rounding a real shortfall down to `0/0`. The
      // last day is already whole, so the run still ends exactly on the goal.
      expected: cumulative ? Math.ceil(load.pace[index] ?? 0) : (load.expected[index] ?? 0),
      date,
      isCurrent: key === todayKey,
      // A day-KEY comparison, not a timestamp one: the dates are built at noon
      // and the clock is not, so `date > now` would put today in the future
      // every morning.
      isFuture: key > todayKey,
      isSelected: key === dayKey.value,
      enabled: periodStore.contains(date),
    }
  })
}

const dailyPoints = computed(() => buildPoints(dailyLoad.value))
const weeklyPoints = computed(() => buildPoints(weeklyLoad.value, true))

/**
 * On time, or behind by how much.
 *
 * Measured against the PACE at the last CLOSED day, never the one being lived:
 * a day asks for its whole target the moment it starts, so charging today would
 * have the page read `13 em atraso` at breakfast every morning. Work done today
 * still counts, since it is the backlog it pays down -- which is why `done`
 * runs through today and `asked` stops at yesterday.
 *
 * `ceil`, because a pace can be fractional where a check-off cannot, and the
 * figure that means something is how many check-offs would put you back ON the
 * line: three quarters of one behind is one to do. It also keeps the words and
 * the picture agreeing -- if the curve sits under the dashed pace at the last
 * closed day, the block says so.
 *
 * `late` is a claim that something is WRONG, so it speaks in the alarm the same
 * way the `Atrasada` chip does, and nothing else on the block does.
 */
function statusOf(load: WeekdayLoad) {
  // Where the browsed week sits against the clock: how many of its days are
  // over, 0 for a week still ahead and 7 for one already past.
  const closed = weekDates(monday.value).filter(
    (date) => periodKey('daily', date) < periodKey('daily', today.value),
  ).length

  const done = load.done.slice(0, Math.min(closed + 1, 7)).reduce((sum, n) => sum + n, 0)
  const asked = closed > 0 ? (load.pace[closed - 1] ?? 0) : 0
  return { late: Math.max(0, Math.ceil(asked - done)), asked }
}

const dailyStatus = computed(() => statusOf(dailyLoad.value))
const weeklyStatus = computed(() => statusOf(weeklyLoad.value))

/** Null when neither week has anything to compare -- a delta of nothing. */
function deltaOf(current: WeekdayLoad, previous: WeekdayLoad): number | null {
  if (current.placed === 0 && previous.placed === 0) return null
  return current.placed - previous.placed
}

const dailyDelta = computed(() => deltaOf(dailyLoad.value, previousDaily.value))
const weeklyDelta = computed(() => deltaOf(weeklyLoad.value, previousWeekly.value))

/**
 * Doing less than last week is not a FAULT -- the app keeps alarm for a
 * deadline that passed -- so only the rise takes an ink, and the fall is
 * stated in the page's own quiet foreground.
 */
function deltaLabel(delta: number): string {
  if (delta === 0) return 'igual a semana passada'
  const glyph = delta > 0 ? '\u25b2' : '\u25bc'
  return `${glyph} ${Math.abs(delta)} vs semana passada`
}

/**
 * Which horizon the page is narrowed to, if any.
 *
 * A gauge is already that band's reading; tapping it says "show me only this",
 * and tapping it again gives the page back. Ephemeral view state, so it lives
 * here in a ref -- the readouts' own arrangement -- and it clears when the
 * browsed day changes, since a band that had work on Monday can be empty today
 * and a page filtered to nothing explains itself to nobody.
 *
 * The GAUGES always render in full, whatever is picked: they are the control,
 * and a control that hides itself cannot be switched back.
 */
const horizon = ref<TaskFrequency | null>(null)

function toggleHorizon(frequency: TaskFrequency) {
  horizon.value = horizon.value === frequency ? null : frequency
  // The two controls are ALTERNATIVES, and taking one hands the page over to
  // it. Two filters at once is a page narrowed twice over: you asked to see the
  // dailies and were shown the three of them that are late. Released rather
  // than restored on the way back out -- by then the choices are the user's,
  // and a default springing back is the page arguing with them.
  held.value = new Set()
}

/**
 * Which readouts are holding the page.
 *
 * A SET rather than one value, because the two are independent switches: each
 * annunciator holds its own question, and what the page shows is the union of
 * the ones held. That is what lets the pair the page opens on be rebuilt after
 * a tap -- the earlier three-valued state could narrow from `both` to one
 * readout and then only release, so the two questions were a door that shut
 * behind you.
 *
 * It lives here rather than in its own module: the card used to take the state
 * as a prop to light its own rows, and a held readout FILTERS the page instead,
 * so nothing outside this view needs the type.
 *
 * A band's gauge is deliberately NOT one of these: a gauge narrows the page to
 * a horizon where a readout narrows it to a question, and the two are
 * alternatives rather than one mechanism wearing two hats.
 *
 * BOTH is the state the page OPENS in: what was missed and what is running are
 * the two things a day asks of you, and the page is the answer to them before
 * anything is tapped. Releasing both gives the whole day back.
 *
 * Ephemeral view state, so it lives here in a ref rather than in a store.
 */
type Readout = 'late' | 'now'

const DEFAULT_READOUTS: Readout[] = ['late', 'now']

const held = ref<Set<Readout>>(new Set(DEFAULT_READOUTS))

/**
 * What the racks are actually filtered by.
 *
 * A readout with NOTHING to hold is dropped from the set rather than allowed to
 * empty the page -- which is what the default would do on a morning with
 * nothing late and nothing running, and what either of them does the moment the
 * last row it counts is checked off. An empty set is no filter at all, so the
 * whole day comes back.
 *
 * The conditions are the segments' OWN, so a readout on the page and the rows
 * it leaves standing cannot disagree about whether it is holding anything.
 */
const litReadouts = computed<Set<Readout>>(() => {
  const lit = new Set<Readout>()
  if (held.value.has('late') && lateCount.value > 0) lit.add('late')
  if (held.value.has('now') && nowLit.value) lit.add('now')
  return lit
})

/**
 * A plain switch: a tap holds the question it names, and a second tap lets it
 * go. Both can be held at once -- they are different questions, and the day
 * asks them both -- and holding neither is the whole day.
 */
function toggleReadout(which: Readout) {
  const next = new Set(held.value)
  if (!next.delete(which)) next.add(which)
  held.value = next
  // The two controls are ALTERNATIVES: a readout counting rows a horizon is
  // hiding is a readout lying about its own figure.
  horizon.value = null
}

/**
 * The way out: both questions let go at once, which is the whole day back.
 *
 * It exists because releasing a held pair takes two taps, and the rail is the
 * one place that can say in a word what the page would look like afterwards.
 * The horizon needs no clearing here -- holding a readout already released it.
 */
function clearReadouts() {
  held.value = new Set()
}

function isLit(which: Readout): boolean {
  return litReadouts.value.has(which)
}

/**
 * Whether a row is one of the ones the held readouts COUNT, and so one of the
 * ones that stays on the page while they are lit.
 *
 * It reads the same two sets the annunciators count themselves off. With both
 * held the sets deliberately OVERLAP, which costs nothing here: a row is kept
 * once.
 */
function counted(task: Task, lit: Set<Readout>): boolean {
  if (lit.has('late') && turnCensus.value.late.has(task.id)) return true
  return lit.has('now') && turnCensus.value.current.has(task.id)
}

/**
 * The bands the racks actually draw, and the rows inside each unit.
 *
 * Two filters that never run together, since each control releases the other: a
 * horizon keeps one band, and a lit readout keeps the rows it COUNTS. The second
 * one takes units and whole bands with it -- a card holding nothing the readout
 * counts has nothing to say, and an empty band is a rule and a ratio over a hole
 * in the page.
 *
 * What it does NOT take is any READING: a unit is racked from the category's
 * whole set and given the shown rows beside it, so the ratio in its head, its
 * meter and its strike are the day's, exactly as the gauges and the band heads
 * above them are. Narrowing those too would cost the figure its meaning the
 * moment it is used -- checking a late row off drops it from the page, so a
 * ratio counting only what is late would fall from `0/2` to `0/1` for work
 * DONE, and the one meter that should have moved never would.
 */
const shownBands = computed(() => {
  const lit = litReadouts.value
  const shown = horizon.value
    ? bands.value.filter((band) => band.frequency === horizon.value)
    : bands.value

  return shown
    .map((band) => ({
      ...band,
      rack: buildCategoryRack(band.items, categoryStore.categories)
        .map((unit) => ({
          ...unit,
          shown: lit.size ? unit.tasks.filter((task) => counted(task, lit)) : unit.tasks,
        }))
        .filter((unit) => unit.shown.length > 0),
    }))
    .filter((band) => band.rack.length > 0)
})

/**
 * The sets are computed against a date, so readouts left held from Monday would
 * be answering a different day. Back to the default rather than off: the
 * browsed day gets the same opening reading today did.
 *
 * Keyed on the DAY, never on `referenceDate` itself: while nothing is pinned
 * that Date is the clock, and a watcher on it fired every sixty seconds --
 * which silently gave the whole page back a minute after any tap.
 */
watch(dayKey, () => {
  held.value = new Set(DEFAULT_READOUTS)
  horizon.value = null
})

const firstName = computed(() => authStore.user?.displayName?.split(' ')[0] ?? '')

/**
 * The eyebrow names the turn the clock is in, which is what makes the accented
 * rows under it legible. Only while browsing today: a turn is running now or it
 * is not running at all.
 */
const eyebrow = computed(() =>
  isToday.value
    ? `Hoje \u00b7 ${TURN_LABELS[turnOf(today.value)]}`
    : formatDate(referenceDate.value),
)
</script>

<template>
  <header class="flex items-start justify-between gap-3 mb-5">
    <div class="min-w-0">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1 class="!mb-0 truncate">Ola, {{ firstName }}</h1>
    </div>
    <RouterLink to="/tasks/new" class="btn shrink-0">Nova</RouterLink>
  </header>

  <template v-if="store.tasks.length">
    <!-- The week strip is folded away here: the curves below are already seven
         tappable days, and two rows of them is one row too many. -->
    <PeriodSelector collapsed />

    <!--
      The week the browsed day sits in, above everything else on the page: the
      rest of Hoje is one day, and a day means little without the seven it is
      part of. Two curves side by side where there is room, because a day and a
      week are two different horizons and neither can be charged to the other --
      the days carry the dailies, the weeks carry what repeats weekly.
    -->
    <div class="curve-frame">
      <section class="curves">
        <!--
          Two curves over the SAME seven days, one per cadence. A day and a week
          are different horizons and neither can be charged to the other -- a
          weekly target belongs to a week, so it is absent from the daily curve
          by construction -- but WHEN the work happened is a question both can
          answer, and answering it on one axis is what lets them be read against
          each other.
        -->
        <article class="curve-block sheet" aria-label="Tarefas diarias na semana">
          <div class="block-head">
            <div class="block-id">
              <RouterLink to="/resumo" class="block-label" title="Ver o resumo da semana"
                >Diarias</RouterLink
              >
              <span class="block-note figure">{{ weekRange }}</span>
            </div>
            <div class="block-read">
              <p class="block-total">
                <span class="total-done">{{ dailyLoad.placed }}</span>
                <span class="total-of">de {{ dailyLoad.demand }}</span>
              </p>
              <!--
                On time, or behind by how much: the block's own verdict, before
                any column is read. Late is a claim that something is WRONG, so
                it speaks in the alarm the `Atrasada` chip speaks in.
              -->
              <p
                class="block-state"
                :class="{ late: dailyStatus.late > 0, idle: !dailyStatus.asked }"
              >
                <span class="state-lamp" aria-hidden="true"></span>
                <template v-if="dailyStatus.late">{{ dailyStatus.late }} em atraso</template>
                <template v-else-if="dailyStatus.asked">Em dia</template>
                <template v-else>Nada cobrado ainda</template>
              </p>
            </div>
          </div>
          <TrendCurve :points="dailyPoints" @select="periodStore.setDate($event)" />
          <p class="block-foot figure">
            <span v-if="dailyDelta !== null" class="foot-delta" :class="{ up: dailyDelta > 0 }">
              {{ deltaLabel(dailyDelta) }}
            </span>
            <template v-if="dailyLoad.undated"> &middot; {{ dailyLoad.undated }} sem dia </template>
          </p>
        </article>

        <!-- The weekly routine over the same seven days: a weekly task pinned to
             a weekday is charged to THAT day, which is what the weekday means.
             Dropped when nothing repeats weekly -- an empty curve reads as
             failure where nothing was ever asked. -->
        <article
          v-if="weeklyTasks.length"
          class="curve-block sheet"
          aria-label="Tarefas semanais na semana"
        >
          <div class="block-head">
            <div class="block-id">
              <RouterLink to="/resumo" class="block-label" title="Ver o resumo da semana"
                >Semanais</RouterLink
              >
              <span class="block-note figure">
                {{ weeklyTasks.length }}
                {{ weeklyTasks.length === 1 ? 'tarefa' : 'tarefas' }}
              </span>
            </div>
            <div class="block-read">
              <p class="block-total">
                <span class="total-done">{{ weeklyLoad.placed }}</span>
                <span class="total-of">de {{ weeklyLoad.demand }} na semana</span>
              </p>
              <p
                class="block-state"
                :class="{ late: weeklyStatus.late > 0, idle: !weeklyStatus.asked }"
              >
                <span class="state-lamp" aria-hidden="true"></span>
                <template v-if="weeklyStatus.late">{{ weeklyStatus.late }} em atraso</template>
                <template v-else-if="weeklyStatus.asked">Em dia</template>
                <template v-else>Nada cobrado ainda</template>
              </p>
            </div>
          </div>
          <TrendCurve
            :points="weeklyPoints"
            mode="cumulative"
            :goal-label="`meta ${weeklyLoad.demand}`"
            @select="periodStore.setDate($event)"
          />
          <!-- A weekly task with no weekday is due any day of the week, so it is
               charged to none of them. The block says so rather than spreading a
               seventh of it across days nobody picked. -->
          <p class="block-foot figure">
            <span v-if="weeklyDelta !== null" class="foot-delta" :class="{ up: weeklyDelta > 0 }">
              {{ deltaLabel(weeklyDelta) }}
            </span>
            <span class="foot-pace" aria-hidden="true"></span>
            <span>ritmo esperado</span>
            <template v-if="weeklyLoad.unpinned">
              &middot; {{ weeklyLoad.unpinned }} sem dia fixo
            </template>
            <template v-if="weeklyLoad.undated">
              &middot; {{ weeklyLoad.undated }} sem dia
            </template>
          </p>
        </article>
      </section>
    </div>

    <!--
      THE FILTER RAIL. What was two banner-width annunciators is a bank of keys
      in a recessed housing: the readouts are switches, and a control that spans
      the column reads as a notice you cannot press.

      Each key keeps the signal that says WHICH question it holds before its
      label is read -- the fault's hazard hatch and its pinging lamp, the
      running turn's caret, the same caret the rows wear in their gutter, so
      every row carrying one is one of the N counted here. A panel reports a
      fault twice: once up here, once on the offending row.

      The keys are INDEPENDENT: each holds its own question, the page shows the
      union of the ones held, and a second tap lets one go. `Tudo` is the way
      out, and it is only on the rail while there is something to let go of.
    -->
    <div
      v-if="lateCount || (runningTurn && nowCount)"
      class="filters"
      role="group"
      aria-label="Filtrar as tarefas do dia"
    >
      <span class="filters-legend" aria-hidden="true">Filtro</span>

      <Transition name="key">
        <button
          v-if="lateCount"
          type="button"
          class="key late"
          :class="{ on: isLit('late') }"
          :aria-pressed="isLit('late')"
          :aria-label="`Mostrar ${lateCount} ${lateCount === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}`"
          @click="toggleReadout('late')"
        >
          <span class="key-lamp" aria-hidden="true"></span>
          <span class="key-count figure">{{ lateCount }}</span>
          <span class="key-label">{{ lateCount === 1 ? 'atrasada' : 'atrasadas' }}</span>
        </button>
      </Transition>

      <Transition name="key">
        <button
          v-if="runningTurn && nowCount"
          type="button"
          class="key now"
          :class="{ on: isLit('now') }"
          :aria-pressed="isLit('now')"
          :aria-label="`Mostrar ${nowCount} ${nowCount === 1 ? 'tarefa' : 'tarefas'} para agora`"
          @click="toggleReadout('now')"
        >
          <span class="key-caret" aria-hidden="true"></span>
          <span class="key-count figure">{{ nowCount }}</span>
          <span class="key-label">para agora</span>
          <!-- Names the turn the count belongs to; the first thing to go when
               the rail gets tight. -->
          <span class="key-note figure" aria-hidden="true">{{ TURN_LABELS[runningTurn] }}</span>
        </button>
      </Transition>

      <Transition name="key">
        <button
          v-if="litReadouts.size"
          type="button"
          class="key all"
          aria-label="Mostrar todas as tarefas do dia"
          @click="clearReadouts"
        >
          <span class="key-cross" aria-hidden="true">&times;</span>
          <span class="key-label">tudo</span>
        </button>
      </Transition>
    </div>

    <!--
      A gauge cluster, one per horizon, instead of a single figure for the day:
      four dailies left and one yearly left are not the same debt, and one bar
      averaging them says neither. Each gauge is tinted with its own frequency
      ink, so a glance maps it to the band below without reading the label. The
      scale counts CHECK-OFFS, so partial progress on a repeating task shows.

      Each gauge is a BUTTON, the same contract as the two annunciators above:
      tapping one keeps the band it measures and drops the other strata. The
      meter and the stratum are one instrument.
    -->
    <!--
      Each gauge is also the way INTO its own horizon: tapping one narrows the
      page to that cadence, tapping it again gives the page back. The cluster
      never filters itself, so the way out is always on screen.
    -->
    <section v-if="bands.length" class="gauges" aria-label="Progresso">
      <button
        v-for="band in bands"
        :key="band.frequency"
        type="button"
        class="gauge"
        :class="{ on: horizon === band.frequency, stood: horizon && horizon !== band.frequency }"
        :style="band.ink"
        :aria-pressed="horizon === band.frequency"
        :aria-label="`Mostrar apenas as tarefas ${band.label.toLowerCase()}`"
        @click="toggleHorizon(band.frequency)"
      >
        <span class="gauge-head">
          <span class="gauge-label">{{ band.label }}</span>
          <span class="gauge-pct figure">{{ band.percent }}%</span>
        </span>
        <span class="gauge-figure figure">
          {{ band.done }}<span class="gauge-slash">/</span>{{ band.total }}
        </span>
        <span class="gauge-track">
          <span class="gauge-fill" :style="{ width: `${band.percent}%` }"></span>
        </span>
        <!--
          The foot is the task-level figure, kept because the two answer
          different questions: half the checks done can still be every task open.
        -->
        <span class="gauge-foot figure">
          <template v-if="band.done >= band.total">Tudo concluido</template>
          <template v-else-if="band.hasRepeats">
            {{ band.tasks.done }}<span class="gauge-slash">/</span>{{ band.tasks.total }} tarefas
          </template>
          <template v-else>
            {{ band.total - band.done }}
            {{ band.total - band.done === 1 ? 'restante' : 'restantes' }}
          </template>
        </span>
      </button>
    </section>

    <p v-if="bands.length === 0" class="section-empty">Nenhuma tarefa para este dia.</p>

    <!--
      One stratum per horizon. The rule is tinted with the frequency's own ink,
      so the layers are told apart before the labels are read -- and the cards
      inside keep their category inks, which is a different axis entirely.
    -->
    <section v-for="band in shownBands" :key="band.frequency" class="band" :style="band.ink">
      <div class="band-head">
        <h2 class="band-name">{{ band.label }}</h2>
        <span class="band-rule" aria-hidden="true"></span>
        <!-- Which horizon is in trouble, before the cards under it are read. -->
        <span v-if="band.late" class="band-late figure">
          {{ band.late }}
          <span class="sr-only">{{ band.late === 1 ? 'atrasada' : 'atrasadas' }}</span>
        </span>
        <!-- Check-offs, the same scale as the band's own gauge above. -->
        <span class="band-count figure">
          {{ band.done }}<span class="band-slash">/</span>{{ band.total }}
        </span>
      </div>
      <div class="rack">
        <CategoryTaskCard
          v-for="(unit, index) in band.rack"
          :key="unit.key"
          :category="unit.category"
          :tasks="unit.tasks"
          :shown="unit.shown"
          :index="index"
        />
      </div>
    </section>
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

/*
 * The curve blocks. The widest reading on a page whose every other figure is
 * one day, and they sit above the fault lamps deliberately: the frame the day
 * is read inside rather than another thing wrong with it.
 *
 * Side by side once there is ROOM for it, measured as a container query rather
 * than a viewport one: the shell is `max-w-4xl`, so a `lg:` split would fire on
 * a wide window inside a narrow column and squeeze seven figures into 195px.
 * The frame exists only to be the container -- an element cannot query itself.
 */
.curve-frame {
  container-type: inline-size;
}

.curves {
  @apply grid gap-3 mt-3;
}

@container (min-width: 640px) {
  .curves {
    grid-template-columns: 1fr 1fr;
  }
}

.curve-block {
  @apply px-3.5 pt-3 pb-3 overflow-hidden;
}

.block-head {
  @apply flex items-end justify-between gap-3 mb-3;
}

.block-id {
  @apply min-w-0 flex flex-col gap-0.5;
}

/* The way into the week's own page, which is where these figures are spelled
   out task by task. */
.block-label {
  @apply font-display text-[1rem] leading-none font-semibold text-fg no-underline w-fit
         transition-colors duration-200;
}

.block-label:hover {
  @apply text-accent-text;
}

.block-note {
  @apply text-[0.6875rem] text-fg-faint truncate;
}

.block-read {
  @apply shrink-0 flex flex-col items-end gap-1;
}

/*
 * The amounts, said plainly: what was done OF what was asked. A ratio in words
 * rather than a percentage, since this block is read at a glance and `37%` of a
 * figure nobody has seen answers nothing.
 */
.block-total {
  @apply flex items-baseline gap-1.5;
}

.total-done {
  @apply font-display text-[1.5rem] leading-none font-semibold text-fg;
}

.total-of {
  @apply font-mono text-[0.6875rem] text-fg-soft;
}

/*
 * The block's verdict, read before any column is: on time in the done ink,
 * behind in the alarm -- the one colour the app reserves for "this is wrong",
 * the same one the `Atrasada` chip speaks in -- and nothing asked yet in the
 * page's own faint foreground. Sentence case, no tracking: the block's voice is
 * plainer than the panel type around it, which is what keeps a page of readouts
 * from sounding like an alarm system.
 */
.block-state {
  @apply flex items-center gap-1.5 text-[0.6875rem] font-medium;
  color: var(--color-done);
}

.state-lamp {
  @apply w-1.5 h-1.5 shrink-0 rounded-full;
  background: currentColor;
}

.block-state.late {
  color: var(--color-alarm);
}

.block-state.idle {
  @apply text-fg-faint font-normal;
}

.block-foot {
  @apply mt-2 flex flex-wrap items-center gap-x-1 text-[0.6875rem] text-fg-faint;
}

/* The dashed swatch that names the pace line, so a second line on the plot does
   not have to be guessed at. */
.foot-pace {
  @apply inline-block w-4 h-0 border-t-2 border-dashed border-fg-faint align-middle;
}

/* A rise takes the done ink; a fall is stated, never alarmed -- doing less than
   last week is not a fault. */
.foot-delta.up {
  color: var(--color-done);
}

/*
 * THE FILTER RAIL. A recessed housing with a bank of keys in it, the way a
 * console carries its switches -- which is what these are. They were two
 * banner-width segments, and a control that spans the column reads as a notice:
 * the width was the last thing still saying "annunciator" about a pair of
 * buttons that filter the page.
 *
 * What the keys kept is their SIGNAL, since that is what says which question a
 * key holds before its label is read: the fault's hazard hatch and pinging
 * lamp, the running turn's caret.
 */
.filters {
  @apply flex flex-wrap items-center gap-1.5 mt-3 mb-2.5 p-1.5 rounded-sm border border-line bg-well;
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--color-void) 7%, transparent);
}

/* The etched legend, and the first thing to go when the rail gets tight: the
   keys name themselves, and the word is the one thing on it that does not. It
   holds back until the two keys and the way out have a row to share. */
.filters-legend {
  @apply hidden min-[480px]:inline shrink-0 pl-1 pr-0.5 font-mono text-[0.625rem] font-medium
         uppercase tracking-[0.16em];
  color: var(--color-fg-faint);
}

/*
 * A key stands PROUD of the rail while it is up -- panel ground, a hairline,
 * its own ink kept to the lamp -- and takes that ink whole while it is down.
 * The same inversion the segments used, at the size of a control rather than
 * the size of a banner.
 */
.key {
  @apply inline-flex items-center gap-2 h-8 px-2.5 rounded-[3px] border cursor-pointer
         font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em]
         transition-[background-image,border-color,color,transform] duration-200;
  -webkit-tap-highlight-color: transparent;
  color: var(--color-fg-soft);
  border-color: var(--color-line-strong);
  background-image: linear-gradient(var(--color-panel), var(--color-panel));
  box-shadow: var(--panel-shadow);
}

/* Key travel. A switch that does not move under the thumb is a picture of one. */
.key:active {
  transform: translateY(1px);
}

.key:focus-visible {
  @apply outline-none;
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

@media (hover: hover) {
  .key.late:hover {
    border-color: var(--color-alarm);
    color: var(--color-alarm);
  }

  .key.now:hover {
    border-color: var(--color-accent-text);
    color: var(--color-accent-text);
  }

  .key.all:hover {
    color: var(--color-fg);
  }
}

/*
 * Set at the label's own SIZE, bold rather than large: a key is one line of
 * panel type, and a display figure with a caption under it competed with the
 * gauge figures directly below for no gain. The label sits at `font-medium`,
 * the weight every other mono micro-cap in the app uses.
 */
.key-count {
  @apply shrink-0 font-bold tracking-normal;
}

.key-label {
  @apply shrink-0;
}

/*
 * The turn the count belongs to. It holds back until the rail has room for all
 * three keys on ONE row, because the eyebrow at the top of the page already
 * names the running turn and a second row of rail does not.
 */
.key-note {
  @apply hidden min-[520px]:inline shrink-0 text-[0.625rem] tracking-[0.1em] opacity-70;
}

.key-lamp {
  @apply w-2 h-2 shrink-0 rounded-full;
  background: var(--color-alarm);
}

/*
 * The lamp pings while the fault is NOT being looked at and holds steady once
 * the key is down and the page is the answer to it. A hard flash on a page you
 * open every morning is punishment; a slow pulse is a panel breathing.
 */
.key.late:not(.on) .key-lamp {
  animation: annunciate 2.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

@keyframes annunciate {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-alarm) 60%, transparent);
  }
  70% {
    box-shadow: 0 0 0 7px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* The row marker, at key scale. Same triangle, same meaning. */
.key-caret {
  @apply shrink-0;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 7px solid var(--color-accent-text);
}

/*
 * Down: the key takes its ink whole, so the control holding the page says so as
 * plainly as the page does. It sits FLUSH while it is down -- the panel shadow
 * goes -- which is the other half of the travel.
 *
 * The ground is painted as a flat one-stop GRADIENT rather than a
 * `background-color`. On these controls `background-color: var(--color-...)`
 * computes to transparent, while the SAME variable resolves normally for
 * `color`, for `border-color`, and inside `color-mix()` or a gradient. The
 * mechanism is not understood; it is not the reference chain, since
 * `--color-alarm` is a plain hex and fails the same way. What is established is
 * the symptom and the shape that works, both read off the rendered pixels in
 * the harness rather than assumed.
 */
.key.on {
  color: var(--color-void);
  box-shadow: none;
}

.key.late.on {
  border-color: var(--color-alarm);
  /* The hazard hatch over the ground: the app's own 45-degree meter gradient
     coarsened from a 3px scale pitch to a 6px hazard one, so a warning and a
     scale cannot be confused. First layer listed paints on top. */
  background-image:
    repeating-linear-gradient(
      45deg,
      transparent 0 6px,
      color-mix(in srgb, var(--color-void) 13%, transparent) 6px 12px
    ),
    linear-gradient(var(--color-alarm), var(--color-alarm));
}

.key.late.on .key-lamp {
  background: var(--color-void);
}

/* NOT hatched: the stripes are the fault's own hazard signal, and a turn that
   is simply running is not a hazard. The caret is what separates the two by
   SHAPE, which is the only thing that holds when the accent is a red. */
.key.now.on {
  border-color: var(--color-accent-text);
  background-image: linear-gradient(var(--color-accent-text), var(--color-accent-text));
}

.key.now.on .key-caret {
  border-left-color: var(--color-void);
}

/*
 * The way out, and only on the rail while there is one -- a key that is always
 * there to clear nothing is the annunciator that is always lit. Dashed and
 * flat: the app's grammar for a gap where nothing is being asked, so it reads
 * as the absence of a filter rather than as a third question.
 */
.key.all {
  /* Pushed to the END of the rail: the two questions sit together on the left
     and the way out is where a reset belongs, which also keeps it on the right
     of the second row once a narrow rail wraps. */
  @apply border-dashed ml-auto gap-1.5 px-2;
  color: var(--color-fg-faint);
  background-image: none;
  box-shadow: none;
}

/*
 * The cross is the whole key on a narrow rail: the word is what makes three
 * keys wrap onto a second row, and a cross at the end of a filter is read
 * everywhere. The `aria-label` carries the meaning either way.
 */
.key-cross {
  @apply shrink-0 text-[0.8125rem] leading-none;
}

.key.all .key-label {
  @apply hidden min-[420px]:inline;
}

/* A key lights rather than appears: it slides out of the rail it belongs to. */
.key-enter-active,
.key-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.key-enter-from,
.key-leave-to {
  @apply opacity-0;
  transform: translateY(-5px);
}

/*
 * Gauges size themselves and wrap: one horizon or five, the cluster still reads.
 * The basis is set so THREE fit a 360px screen: five horizons then take two rows
 * rather than three, and the lone fifth no longer stretches into a full-width
 * bar that reads as a different kind of meter from the four above it.
 */
.gauges {
  @apply flex flex-wrap gap-2;
}

/*
 * A gauge is a button now: the reading and the way into the horizon it reads
 * are the same object, which is what keeps the page from growing a row of
 * filter chips saying what the gauges already say.
 */
.gauge {
  @apply flex-1 basis-[100px] px-2.5 py-2 text-left bg-panel border border-line-strong rounded-sm
         cursor-pointer transition-[opacity,box-shadow,border-color,background-image] duration-200;
  box-shadow: var(--panel-shadow);
  -webkit-tap-highlight-color: transparent;
}

/* Stood down, not hidden: the way out of a filter must stay on screen and
   legible, and the cluster is the only thing on the page that is exempt --
   everything the two filters drop is dropped outright. */
.gauge.stood {
  @apply opacity-45;
}

@media (hover: hover) {
  .gauge:hover {
    border-color: var(--band-ink);
  }

  .gauge.stood:hover {
    @apply opacity-80;
  }
}

.gauge:focus-visible {
  @apply outline-none;
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

/*
 * Held down: the ring and wash in the BAND's own ink, never the accent -- the
 * cluster's whole job is mapping a colour to a stratum, and an Anual card
 * turning amber when picked would break the one mapping it exists for. The
 * meter itself is NOT inverted: a fill drawn in the ground colour is a meter
 * nobody can read.
 */
.gauge.on {
  border-color: var(--band-ink);
  background-image: linear-gradient(
    90deg,
    color-mix(in srgb, var(--band-ink) 18%, transparent),
    color-mix(in srgb, var(--band-ink) 6%, transparent)
  );
  box-shadow:
    0 0 0 2px var(--band-ink),
    0 0 12px color-mix(in srgb, var(--band-ink) 18%, transparent);
}

.gauge-head {
  @apply flex items-baseline justify-between gap-2;
}

.gauge-label {
  @apply font-mono text-[0.5625rem] font-medium uppercase tracking-[0.12em] truncate;
  color: var(--band-ink);
}

.gauge-pct {
  @apply shrink-0 text-[0.625rem] text-fg-faint;
}

.gauge-figure {
  @apply block mt-0.5 text-[1.125rem] leading-none font-medium text-fg;
  text-shadow: 0 0 12px color-mix(in srgb, var(--band-ink) 30%, transparent);
}

.gauge-slash {
  @apply text-fg-faint mx-0.5;
}

/* Hatched track, so an empty gauge still reads as a scale rather than a void. */
.gauge-track {
  @apply relative block h-1.5 w-full mt-1.5 border border-fg overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.gauge-fill {
  @apply block h-full transition-[width] duration-500;
  background: var(--band-ink);
}

.gauge-foot {
  @apply block mt-1 text-[0.5625rem] font-medium uppercase tracking-[0.08em] text-fg-faint truncate;
}

.band {
  @apply mt-6;
}

.band-head {
  @apply flex items-center gap-3 mb-3;
}

.band-name {
  @apply !mb-0 shrink-0 font-mono text-[0.75rem] font-medium uppercase tracking-[0.18em];
  color: var(--band-ink);
}

/* The stratum line: it starts at the frequency's own ink and burns off. */
.band-rule {
  @apply flex-1 h-px;
  background: linear-gradient(90deg, var(--band-ink), transparent);
}

.band-count {
  @apply shrink-0 text-[0.75rem] text-fg-soft;
}

/* The stratum's own fault lamp, sized to sit beside the count without moving it. */
.band-late {
  @apply shrink-0 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none rounded-[2px];
  color: var(--color-alarm);
  border: 1px solid var(--color-alarm);
  background: var(--color-alarm-dim);
}

.band-slash {
  @apply text-fg-faint mx-px;
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
