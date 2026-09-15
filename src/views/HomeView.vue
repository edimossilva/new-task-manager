<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Task } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS, TURN_LABELS, formatDate, turnOf } from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import { buildCategoryRack } from '@/composables/use-category-rack'
import { percentOf } from '@/usecases'
import CategoryTaskCard from '@/components/CategoryTaskCard.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'
import { isBandSpotlight, type Spotlight } from '@/components/spotlight'

const authStore = useAuthStore()
const store = useTaskStore()
const categoryStore = useCategoryStore()
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
 * Which readout is holding the page. Ephemeral view state, so it lives here in a
 * ref and travels down as a prop rather than into a store.
 *
 * `undefined` is "nobody has tapped yet", and then the page lights Para agora on
 * its own: the rows the running turn is asking for are what the page is opened
 * to see, so they should not need a tap to stand out. Following the readout
 * rather than a fixed value is what lets the default release when the turn ends
 * or the last of those tasks is ticked off -- a spotlight with no button to
 * clear it would leave every row stood down. A tap is an explicit choice and
 * wins until the day changes, so tapping the lit segment does turn it off.
 *
 * Cleared when the browsed day changes: the sets are computed against a date,
 * and a spotlight left on from Monday would be lighting a different answer.
 */
const spotlightChoice = ref<Spotlight | null | undefined>(undefined)

const spotlight = computed<Spotlight | null>(() =>
  spotlightChoice.value === undefined ? (nowLit.value ? 'now' : null) : spotlightChoice.value,
)

function toggleSpotlight(which: Spotlight) {
  spotlightChoice.value = spotlight.value === which ? null : which

  // A gauge tap that LIGHTS a band also takes the page to it: the meter sits
  // above the fold and the stratum it reads may be two screens down, and a
  // spotlight the user has to scroll to find is an answer left in the dark.
  // Releasing it scrolls nowhere, and the annunciators never do -- their rows
  // are spread across every band, so there is no one place to go.
  if (isBandSpotlight(which) && spotlight.value === which) {
    nextTick(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document
        .getElementById(`band-${which}`)
        ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    })
  }
}

watch(referenceDate, () => {
  spotlightChoice.value = undefined
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
    <PeriodSelector />

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
          :class="{ on: spotlight === 'late' }"
          :aria-pressed="spotlight === 'late'"
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
          :class="{ on: spotlight === 'now' }"
          :aria-pressed="spotlight === 'now'"
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
    <section v-if="bands.length" class="gauges" aria-label="Progresso">
      <button
        v-for="band in bands"
        :key="band.frequency"
        type="button"
        class="gauge"
        :class="{ on: spotlight === band.frequency }"
        :style="band.ink"
        :aria-pressed="spotlight === band.frequency"
        :aria-label="`Destacar tarefas: ${band.label}`"
        @click="toggleSpotlight(band.frequency)"
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
    <section
      v-for="band in bands"
      :id="`band-${band.frequency}`"
      :key="band.frequency"
      class="band"
      :style="band.ink"
    >
      <!-- A gauge holding the page stands the OTHER strata's heads down with their cards. -->
      <div
        class="band-head"
        :class="{ stood: isBandSpotlight(spotlight) && spotlight !== band.frequency }"
      >
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
          :spotlight="spotlight"
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

.gauge {
  @apply flex-1 basis-[100px] px-2.5 py-2 text-left bg-panel border border-line-strong rounded-sm
         cursor-pointer transition-[box-shadow,border-color,background-image] duration-200;
  box-shadow: var(--panel-shadow);
  -webkit-tap-highlight-color: transparent;
}

.gauge:hover {
  border-color: var(--band-ink);
}

.gauge:focus-visible {
  @apply outline-none;
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

/*
 * Held down: the ring and wash the rows it lights take, in the same ink, so the
 * meter and the stratum read as one lit instrument. The meter itself is NOT
 * inverted -- a fill drawn in the ground colour is a meter nobody can read.
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
  /* The scroll target clears the sticky masthead (h-14 plus the notch) with a breath to spare. */
  scroll-margin-top: calc(3.5rem + env(safe-area-inset-top, 0px) + 0.75rem);
}

.band-head {
  @apply flex items-center gap-3 mb-3 transition-opacity duration-[260ms];
}

.band-head.stood {
  @apply opacity-40;
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
