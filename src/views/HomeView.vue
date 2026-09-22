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
import type { Spotlight } from '@/components/spotlight'
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
      rack: buildCategoryRack(tasks, categoryStore.categories),
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
 * here in a ref -- the spotlight's own arrangement -- and it clears when the
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
  // it. A horizon under a spotlight is the worst of both: you asked to see the
  // dailies and most of them are standing down at 30% because they are neither
  // late nor in the running turn. Released rather than restored on the way back
  // out -- by then the choices are the user's, and a default springing back is
  // the page arguing with them.
  spotlight.value = null
}

/** The bands the racks actually draw. */
const shownBands = computed(() =>
  horizon.value ? bands.value.filter((band) => band.frequency === horizon.value) : bands.value,
)

/**
 * Which readout is holding the page.
 *
 * `both` is the state the page OPENS in: what was missed and what is running
 * are the two things a day asks of you, and the panel should be pointing at
 * them before anything is tapped. Tapping a readout then narrows the page to
 * that one question, and tapping it again releases the page entirely.
 *
 * Ephemeral view state, so it lives here in a ref and travels down as a prop
 * rather than into a store; the TYPE lives in its own module, since the card
 * needs it too.
 */
const DEFAULT_SPOTLIGHT: Spotlight = 'both'

const spotlight = ref<Spotlight | null>(DEFAULT_SPOTLIGHT)

/**
 * What the cards are actually given.
 *
 * A spotlight lighting NOTHING would stand every row on the page down -- which
 * is what the default would do on a morning with nothing late and nothing
 * running, and what any of them does the moment the last counted row is checked
 * off. The readout that is holding the page must have something to hold.
 */
const litSpotlight = computed<Spotlight | null>(() => {
  const held = spotlight.value
  if (!held) return null
  const late = held !== 'now' && lateCount.value > 0
  // `nowLit` is the readout's own condition, so the guard and the segment on
  // the page cannot disagree about whether there is anything to hold.
  const now = held !== 'late' && nowLit.value
  return late || now ? held : null
})

function toggleSpotlight(which: Spotlight) {
  // From `both`, a tap narrows rather than releases: the readout was lit as one
  // of two, and tapping it is a request to be shown only its own answer.
  spotlight.value = spotlight.value === which ? null : which
  // The same rule the other way: a readout counting rows a horizon filter is
  // hiding is a readout lying about its own figure.
  horizon.value = null
}

/** Lit as itself, or as half of the pair the page opened on. */
function isLit(which: Spotlight): boolean {
  return litSpotlight.value === which || litSpotlight.value === 'both'
}

/**
 * The sets are computed against a date, so a spotlight left on from Monday
 * would be lighting a different answer. Back to the default rather than off:
 * the browsed day gets the same opening reading today did.
 *
 * Keyed on the DAY, never on `referenceDate` itself: while nothing is pinned
 * that Date is the clock, and a watcher on it fired every sixty seconds --
 * which silently put the page's spotlight out a minute after any tap.
 */
watch(dayKey, () => {
  spotlight.value = DEFAULT_SPOTLIGHT
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
      The master annunciator. A panel reports a fault twice -- once at the top,
      where it is seen before anything is read, and once on the offending row.
      This is the first half, and it is drawn in the app's own hatch, coarsened
      from the meters' 3px scale pitch to a 6px hazard pitch so it reads as a
      warning rather than as another gauge. Dropped entirely when nothing is
      late: an annunciator that is always lit annunciates nothing.
    -->
    <!--
      The two readouts are ONE block, flush, sharing a seam: a panel with two
      lamps rather than a stack of notices. Faults on top, what is live under it.
    -->
    <div v-if="lateCount || (runningTurn && nowCount)" class="annunciators">
      <Transition name="annunciator">
        <button
          v-if="lateCount"
          type="button"
          class="annunciator"
          :class="{ on: isLit('late') }"
          :aria-pressed="isLit('late')"
          :aria-label="`Destacar ${lateCount} ${lateCount === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}`"
          @click="toggleSpotlight('late')"
        >
          <span class="annunciator-lamp" aria-hidden="true"></span>
          <p class="annunciator-text">
            <span class="annunciator-count figure">{{ lateCount }}</span>
            {{ lateCount === 1 ? 'atrasada' : 'atrasadas' }}
          </p>
        </button>
      </Transition>

      <!--
        The running turn's own readout, under the fault and above the gauges:
        the panel reports what is wrong first, then what is live. Its lamp is
        the SAME caret the rows wear in their gutter, so the figure here and the
        marks down the page are visibly one instrument -- every row carrying
        that caret is one of the N counted here.

        Both segments are BUTTONS: tapping one spotlights the rows it counts.
      -->
      <Transition name="annunciator">
        <button
          v-if="runningTurn && nowCount"
          type="button"
          class="turnbar"
          :class="{ on: isLit('now') }"
          :aria-pressed="isLit('now')"
          :aria-label="`Destacar ${nowCount} ${nowCount === 1 ? 'tarefa' : 'tarefas'} para agora`"
          @click="toggleSpotlight('now')"
        >
          <span class="turnbar-caret" aria-hidden="true"></span>
          <p class="turnbar-text">
            <span class="turnbar-count figure">{{ nowCount }}</span>
            para agora
          </p>
          <!-- Names the turn the count belongs to; the first thing to go when
               the segment gets tight. -->
          <span class="turnbar-note figure" aria-hidden="true">
            {{ TURN_LABELS[runningTurn] }}
          </span>
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
      tapping one spotlights every row in the band it measures and stands the
      other strata down. The meter and the stratum are one instrument.
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
          :index="index"
          :spotlight="litSpotlight"
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
 * The annunciator. Alarm on alarm-dim, hatched at a 6/12px hazard pitch -- the
 * same 45-degree gradient every meter in the app draws, coarsened so the two
 * cannot be confused. The lamp pings rather than blinks: a hard flash on a page
 * you look at every morning is punishment, a slow pulse is a panel breathing.
 */
/*
 * Two lamps in one housing, laid out the way the gauge cluster under it is: a
 * wrapping row of self-sizing segments. Stacked full-width bars read as a pile
 * of notices; side by side they read as a panel, and the page keeps its rhythm.
 */
.annunciators {
  @apply flex flex-wrap gap-2.5 mt-3 mb-2.5;
}

.annunciator {
  @apply flex flex-1 basis-[160px] items-center gap-2.5 px-3 py-2 border rounded-sm
         text-left cursor-pointer transition-[background-color,box-shadow] duration-200;
  -webkit-tap-highlight-color: transparent;
  color: var(--color-alarm);
  border-color: var(--color-alarm);
  background-color: var(--color-alarm-dim);
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 6px,
    color-mix(in srgb, var(--color-alarm) 13%, transparent) 6px 12px
  );
}

.annunciator-lamp {
  @apply w-2 h-2 shrink-0 rounded-full;
  background: var(--color-alarm);
  animation: annunciate 2.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.annunciator-text {
  @apply flex items-baseline gap-1.5 flex-1 min-w-0
         font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] truncate;
  color: inherit;
}

/*
 * Set at the label's own SIZE, so the segment is one line of panel type rather
 * than a display figure with a caption under it, and bold so the figure is still
 * what the eye lands on. The weight does the work the size used to.
 *
 * The label sits at `font-medium`, the weight every other mono micro-cap in the
 * app already uses: 600 against 700 is a subpixel at 11px, and these two labels
 * were the only ones wearing semibold anyway.
 */
.annunciator-count {
  @apply shrink-0 font-bold tracking-normal;
}

.turnbar-note {
  @apply hidden min-[380px]:inline shrink-0 text-[0.625rem] uppercase tracking-[0.1em] opacity-70;
}

/* Slides down from under the selector, the way a lamp lights rather than appears. */
.annunciator-enter-active,
.annunciator-leave-active {
  transition:
    opacity 260ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.annunciator-enter-from,
.annunciator-leave-to {
  @apply opacity-0;
  transform: translateY(-6px);
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

/*
 * The running turn's bar. Deliberately NOT hatched: the diagonal stripes are the
 * fault's own hazard signal, and a turn that is simply running is not a hazard.
 * A clean accent ground and the caret is what separates them by SHAPE, which is
 * the only thing that holds when the accent is a red the user picked.
 */
.turnbar {
  @apply flex flex-1 basis-[160px] items-center gap-2.5 px-3 py-2 border rounded-sm
         text-left cursor-pointer transition-[background-color,box-shadow] duration-200;
  -webkit-tap-highlight-color: transparent;
  color: var(--color-accent-text);
  border-color: var(--color-accent-text);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-accent-text) 16%, transparent),
    color-mix(in srgb, var(--color-accent-text) 5%, transparent)
  );
}

/*
 * Held down: the segment inverts to a solid ground, so the control that is
 * holding the page says so as plainly as the page does.
 */
.annunciator.on {
  color: var(--color-void);
  /* Hatch over a flat one-stop gradient -- see `.turnbar.on` for why the ground
     is not a `background-color`. First layer listed paints on top. */
  background-image:
    repeating-linear-gradient(
      45deg,
      transparent 0 6px,
      color-mix(in srgb, var(--color-void) 13%, transparent) 6px 12px
    ),
    linear-gradient(var(--color-alarm), var(--color-alarm));
}

.annunciator.on .annunciator-lamp {
  background: var(--color-void);
}

.turnbar.on {
  color: var(--color-void);
  /*
   * Painted as a flat one-stop GRADIENT rather than `background-color`.
   *
   * On these two segments `background-color: var(--color-...)` computes to
   * transparent, while the SAME variable resolves normally for `color`, for
   * `border-color`, and inside `color-mix()` or a gradient -- which is how the
   * base rule below paints its wash and how the category strike draws its rule.
   * The mechanism is not understood; it is not the reference chain, since
   * `--color-alarm` is a plain hex and fails the same way on the sibling. What
   * is established is the symptom and the shape that works, both read off the
   * rendered pixels in the harness rather than assumed.
   */
  background-image: linear-gradient(var(--color-accent-text), var(--color-accent-text));
}

.turnbar.on .turnbar-caret {
  border-left-color: var(--color-void);
}

.annunciator.on .annunciator-lamp,
.turnbar.on .turnbar-caret,
.annunciator.on .annunciator-count,
.turnbar.on .turnbar-count {
  color: var(--color-void);
}

.annunciator:focus-visible,
.turnbar:focus-visible {
  @apply outline-none;
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

/* The row marker, at strip scale. Same triangle, same meaning. */
.turnbar-caret {
  @apply shrink-0;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 7px solid var(--color-accent-text);
}

.turnbar-text {
  @apply flex items-baseline gap-1.5 flex-1 min-w-0
         font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] truncate;
  /* A <p>, so the global paragraph colour would otherwise beat the pressed
     ground's inverted ink and leave the label dark on dark. */
  color: inherit;
}

.turnbar-count {
  @apply shrink-0 font-bold tracking-normal;
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
   legible, which is the spotlight's own rule one altitude up. */
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
