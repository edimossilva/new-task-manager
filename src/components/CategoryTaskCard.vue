<script setup lang="ts">
import { computed } from 'vue'
import type { Category, Task } from '@/entities'
import { INKS, formatDate, formatDateTime, formatTime, turnPlan, turnSlots } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TurnBadge from '@/components/TurnBadge.vue'
import TaskStamp from '@/components/TaskStamp.vue'
import CompletionGauge from '@/components/CompletionGauge.vue'
import TaskInfoLink from '@/components/TaskInfoLink.vue'
import CategoryInfoLink from '@/components/CategoryInfoLink.vue'
import { isBandSpotlight, type Spotlight } from '@/components/spotlight'

/*
 * The home page's rack unit, and only that: a category's tasks at the density
 * Hoje reads them at. The registry -- description, category, target, the four
 * row actions -- is the tasks page's table, so nothing here needs to carry a
 * second, denser mode.
 */
const props = defineProps<{
  /** Absent for the unfiled unit, which is a real bucket rather than a category. */
  category?: Category
  tasks: Task[]
  /** Position in the rack, used only to stagger the reveal. */
  index: number
  /**
   * Which readout is holding the page, if any. The card lights the rows it
   * counts and stands the rest down.
   */
  spotlight?: Spotlight | null
}>()

const store = useTaskStore()
const { referenceDate, today } = usePeriodSelection()

/*
 * Bound inline from the ink table rather than through twenty CSS classes, the
 * same trade CategoryBadge and InkSwatches make. The label adds `.ink-text`,
 * which picks `deep` or `bright` per theme, so the unit reads on paper and on
 * glass without knowing which it landed on.
 */
const inkVars = computed(() => {
  const ink = props.category ? INKS[props.category.ink] : undefined
  if (!ink) return {}
  return {
    '--cat-base': ink.base,
    '--cat-deep': ink.deep,
    '--cat-bright': ink.bright,
    '--cat-dim': ink.dim,
  }
})

/*
 * Every row resolved ONCE. Each of these questions walks the task's check-offs,
 * and the template used to ask five of them per row -- the count twice over, for
 * the stamp and for the gauge.
 *
 * `today` is the clock rather than `referenceDate`: a turn passes during the
 * browsed day, and a pinned `referenceDate` deliberately does not subscribe to
 * the tick, so without it a row would freeze in the turn it first rendered in.
 */
const rows = computed(() =>
  props.tasks.map((task) => {
    const count = store.completionCountFor(task, referenceDate.value)
    const state = store.turnState(task, referenceDate.value, today.value)
    const late = new Set(state.late)
    const current = new Set(state.current)

    // An inactive task is out of the routine, so the clock has no claim on it.
    // Its chip already reads `Inativa`; without this the row would still wear
    // the rail of a state the chip is not showing.
    const live = task.active
    const isLate = live && store.isLateOn(task, referenceDate.value, today.value)
    const isNow = live && current.size > 0
    const completed = count >= task.timesPerPeriod

    // The latest check-off in the period, for any row that has one -- a task at
    // one of two has still been worked on, and when is worth saying. A daily's
    // period IS the browsed day, already named at the top of the page, so it
    // says the hour alone; every other cadence spans days and has to say which
    // one. Check-offs written before the moment was recorded have nothing to
    // say here and the line is dropped rather than filled with a placeholder.
    const doneAt = count > 0 ? store.lastCompletionAt(task, referenceDate.value) : undefined

    return {
      task,
      count,
      completed,
      doneAt: doneAt
        ? task.frequency === 'daily'
          ? formatTime(doneAt)
          : formatDateTime(doneAt)
        : undefined,
      due: store.dueByNow(task, referenceDate.value, today.value),
      isLate,
      isNow,
      // What the lit readout is pointing at. `isNow` already means an OPEN slot
      // in the running turn, so "not checked" needs no second test.
      spotlit:
        props.spotlight === 'late'
          ? isLate
          : props.spotlight === 'now'
            ? isNow
            : props.spotlight
              ? task.frequency === props.spotlight
              : false,
      currentTurn: state.current[0],
      slots: turnSlots(task.turns, task.timesPerPeriod),
      groups: turnPlan(task.turns, task.timesPerPeriod).groups.map((group) => ({
        ...group,
        // Every slot of this turn covered. Mutually exclusive with the other two
        // by construction: a covered group is in neither the late nor the open
        // slice `turnState` builds.
        done: count >= group.doneAt,
        late: live && late.has(group.turn),
        current: live && current.has(group.turn),
      })),
    }
  }),
)

/*
 * The head's ratio is a reading of the WORK, so it counts active tasks only. A
 * card holding nothing but inactive ones has no ratio to give and falls back to
 * a plain count of the rows instead.
 *
 * It counts CHECK-OFFS, not whole tasks: a task wanting eight of them is eight
 * notches on this unit's scale, so the third one moves the meter rather than the
 * card reading zero until the task lands. Where nothing repeats, every task is
 * worth one check and the ratio is the task count it always was.
 */
/*
 * A unit holding nothing the lit readout counts stands down as a whole, so the
 * eye can skip the card rather than read every row in it. Inside a unit that
 * does hold one, only the rows that are not it dim.
 */
const spotlit = computed(() => rows.value.some((row) => row.spotlit))

const activeTasks = computed(() => props.tasks.filter((task) => task.active))
const checks = computed(() => store.checkTally(activeTasks.value, referenceDate.value))
const hasRatio = computed(() => activeTasks.value.length > 0)
/**
 * Every active task in the unit has reached its target. Counted off the shared
 * tally rather than the rows, so the card cannot disagree with the ratio in its
 * own head, and `total > 0` keeps a unit holding nothing but inactive tasks --
 * which has no ratio to give -- from reading as finished.
 */
const settled = computed(() => checks.value.total > 0 && checks.value.done >= checks.value.total)

const progress = computed(() =>
  checks.value.total === 0 ? 0 : (checks.value.done / checks.value.total) * 100,
)
</script>

<template>
  <!--
    A rack unit: the category's ink runs down the left edge and tints the head,
    the readout under it is that category's own progress for the browsed period,
    and the tasks are the ruled rows of the module.
  -->
  <section
    class="unit"
    :class="{
      unfiled: !category,
      settled,
      stood: spotlight && !spotlit,
      'spot-late': spotlight === 'late',
      'spot-now': spotlight === 'now',
      'spot-band': isBandSpotlight(spotlight),
    }"
    :style="{ ...inkVars, '--i': index }"
  >
    <header class="unit-head">
      <!-- The head names the category and is the way into its page; the
           unfiled bucket is not a category and has none. -->
      <h2 class="unit-name ink-text" :title="category?.description || undefined">
        <RouterLink
          v-if="category"
          :to="`/categories/${category.id}`"
          class="unit-link unit-label"
          >{{ category.name }}</RouterLink
        >
        <span v-else class="unit-label">Sem categoria</span>
      </h2>
      <span v-if="hasRatio" class="unit-count figure">
        {{ checks.done }}<span class="unit-slash">/</span>{{ checks.total }}
        <span class="sr-only">marcacoes concluidas</span>
      </span>
      <span v-else class="unit-count figure">
        {{ tasks.length }}
        <span class="sr-only">{{ tasks.length === 1 ? 'tarefa' : 'tarefas' }}</span>
      </span>

      <!--
        The way into the category's own page, the same key the task rows wear.
        `self-center` because the head aligns on the baseline, which a 44px
        target has no business sitting on. The unfiled bucket is not a category
        and has no page to open.
      -->
      <CategoryInfoLink v-if="category" :category="category" class="self-center -my-2 -mr-1.5" />
    </header>

    <div v-if="hasRatio" class="unit-track" :aria-hidden="true">
      <div class="unit-fill" :style="{ width: `${progress}%` }"></div>
    </div>

    <TransitionGroup tag="ul" name="task" class="unit-list">
      <li
        v-for="row in rows"
        :key="row.task.id"
        class="task"
        :class="{
          off: !row.task.active,
          late: row.isLate,
          now: row.isNow,
          spot: row.spotlit,
          stood: spotlight && !row.spotlit,
        }"
      >
        <TaskStamp
          :task="row.task"
          :count="row.count"
          :period-label="formatDate(referenceDate)"
          :disabled="!row.task.active"
          :late="row.isLate"
          :now="row.isNow"
          @advance="store.advanceCompletion(row.task.id, referenceDate)"
        />

        <div class="task-body">
          <p class="task-title" :class="{ struck: row.completed }">{{ row.task.title }}</p>

          <!-- The moment of the latest check-off, led in by a rule in the done
               ink, the same green the strike above it takes once the period
               is finished. -->
          <p v-if="row.doneAt" class="task-done-at figure">
            <span class="sr-only">Concluida em</span>{{ row.doneAt }}
          </p>

          <CompletionGauge
            v-if="row.task.timesPerPeriod > 1"
            :count="row.count"
            :total="row.task.timesPerPeriod"
            :slots="row.slots"
            :due="row.due"
            :current-turn="row.currentTurn"
            class="mt-1"
            @set="(count) => store.setCompletionCount(row.task.id, count, referenceDate)"
            @undo="store.undoCompletion(row.task.id, referenceDate)"
          />

          <!-- Dropped entirely when there is nothing to say, rather than
               spending its top margin on an empty line. -->
          <div
            v-if="row.task.weekday || row.task.turns.length || !row.task.active || row.isLate"
            class="task-tags"
          >
            <WeekdayBadge v-if="row.task.weekday" :weekday="row.task.weekday" />
            <!--
              A row can never carry both: a weekday implies weekly, a turn
              implies daily. A 1x task has no gauge to edge, so the chip is the
              only place its turn can be read.
            -->
            <TurnBadge
              v-for="group in row.groups"
              :key="group.turn"
              :turn="group.turn"
              :count="group.count"
              :done="group.done"
              :late="group.late"
              :current="group.current"
            />
            <!--
              Inativa outranks Atrasada: the clock has no claim on a task that is
              out of the routine. There is deliberately no chip for the RUNNING
              turn -- the rail, the accented turn badge and the gauge's lit cells
              already say it three times, and a fourth in words would be the
              loudest of the four for the mildest of the states. A fault earns a
              word; being on time does not.
            -->
            <span v-if="!row.task.active" class="task-off">Inativa</span>
            <span v-else-if="row.isLate" class="task-late">Atrasada</span>
          </div>
        </div>

        <!--
          The only action the rack carries: the way into the task's own page,
          where the history and the rest of the controls are. Reading is safe
          from a page whose job is ticking things off; editing and deleting
          belong to the registry. Pulled up out of the row's padding so a 44px
          target does not make every row taller than its stamp.
        -->
        <TaskInfoLink :task="row.task" class="-my-2 -mr-1.5" />
      </li>
    </TransitionGroup>
  </section>
</template>

<style scoped>
@reference "../assets/main.css";

.unit {
  @apply relative overflow-hidden mb-4 pl-3 bg-panel border;
  /* The hairline takes a trace of the ink, so a unit is identifiable from its
     silhouette alone, before the rail or the label are read. */
  border-color: color-mix(in srgb, var(--cat-base, transparent) 26%, var(--color-line-strong));
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
  /* Cards sit in a CSS column flow, so one must never be split down the middle. */
  break-inside: avoid;
  animation: unit-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
  /* Capped: the twelfth unit should not wait most of a second to exist. */
  animation-delay: calc(min(var(--i), 6) * 55ms);
}

/* The ink rail: the unit's whole identity in three pixels. */
.unit::before {
  content: '';
  @apply absolute left-0 top-0 bottom-0 w-[3px];
  background: var(--cat-base);
  box-shadow: 0 0 12px var(--cat-dim);
}

/* Nothing filed here, so the rail is drawn as a gap in the line. */
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
  @apply !mb-0 flex-1 min-w-0 font-display text-[0.9375rem] font-semibold uppercase
         tracking-[0.1em] truncate;
}

.unit-link {
  @apply text-inherit no-underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
  transition: text-decoration-color 140ms;
}

.unit-link:hover {
  text-decoration: underline;
  text-decoration-color: currentColor;
}

.unit.unfiled .unit-name {
  @apply text-fg-faint;
}

/*
 * The whole module kept: the category's name is ruled through in the done ink,
 * the same green the task titles and the kept turn chips take.
 *
 * Drawn as a background gradient sized from 0 rather than as `text-decoration`,
 * for two reasons: a decoration cannot be transitioned, so the last check-off
 * would snap the line on; and this sizes to the TEXT, where a pseudo-element on
 * `.unit-name` would span the whole flexed head. It rides the inline label in
 * both branches, so the unfiled bucket settles the same way a category does.
 *
 * On a card that is already settled at first paint there is no transition to
 * run, so it simply renders struck -- the sweep belongs to the check-off that
 * earned it, not to every page load.
 */
.unit-label {
  background-image: linear-gradient(var(--color-done), var(--color-done));
  background-repeat: no-repeat;
  background-position: 0 52%;
  background-size: 0% 2px;
  transition: background-size 460ms cubic-bezier(0.22, 1, 0.36, 1);
}

.unit.settled .unit-label {
  background-size: 100% 2px;
}

.unit-count {
  @apply shrink-0 text-[0.8125rem] text-fg-soft;
}

.unit-slash {
  @apply text-fg-faint mx-px;
}

/* The module's own meter, hatched so an empty one still reads as a scale. */
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

.unit-list {
  @apply relative px-3.5 pb-1;
}

.task {
  @apply relative flex items-start gap-3 py-2 border-b border-line;
}

/*
 * The annunciator's other half, on the offending row. A tick of alarm inside the
 * category's own rail -- deliberately not flush with it, or the two would read
 * as one thick edge -- and a wash that runs off to the right so it lights the
 * left margin the eye scans without tinting the text it lands on.
 */
.task.late {
  background-image: linear-gradient(90deg, var(--color-alarm-dim), transparent 62%);
}

/*
 * THE SPOTLIGHT. Tapping a readout above turns the page into an answer to that
 * one question: the rows it counts are lit and lifted, everything else stands
 * down. `--spot-ink` is set by which readout is holding the page, so one set of
 * rules serves both and the fault cannot borrow the accent or the reverse.
 *
 * `z-index` because a lit row's ring has to cross its neighbours' borders, and
 * the unit clips at 14px of padding, which is why the bloom stays modest.
 */
.unit.spot-late {
  --spot-ink: var(--color-alarm);
  --spot-glow: var(--color-alarm-dim);
}

.unit.spot-now {
  --spot-ink: var(--color-accent-text);
  --spot-glow: var(--color-accent-dim);
}

/* A gauge holding the page: the band's own ink, inherited from the stratum. */
.unit.spot-band {
  --spot-ink: var(--band-ink);
  --spot-glow: color-mix(in srgb, var(--band-ink) 18%, transparent);
}

.task.spot {
  @apply relative z-[1];
  background-image: linear-gradient(
    90deg,
    color-mix(in srgb, var(--spot-ink) 22%, transparent),
    color-mix(in srgb, var(--spot-ink) 7%, transparent)
  );
  box-shadow:
    0 0 0 2px var(--spot-ink),
    0 0 12px var(--spot-glow);
  animation: spot-strike 620ms cubic-bezier(0.22, 1, 0.36, 1);
}

/*
 * Stood down, not hidden: still legible, still tappable. Dimming the whole unit
 * when it holds nothing is what lets the eye skip a card instead of reading it.
 */
.task.stood {
  @apply opacity-30;
}

.unit.stood {
  @apply opacity-40;
}

.task,
.unit {
  transition:
    opacity 260ms ease,
    box-shadow 260ms ease;
}

/* Two beats, then it settles: the strike is what makes the answer findable. */
@keyframes spot-strike {
  0% {
    box-shadow:
      0 0 0 2px var(--spot-ink),
      0 0 0 0 var(--spot-glow);
  }
  35% {
    box-shadow:
      0 0 0 3px var(--spot-ink),
      0 0 0 9px var(--spot-glow);
  }
  70% {
    box-shadow:
      0 0 0 2px var(--spot-ink),
      0 0 0 0 var(--spot-glow);
  }
  100% {
    box-shadow:
      0 0 0 2px var(--spot-ink),
      0 0 12px var(--spot-glow);
  }
}

/*
 * The turn the clock is in, one notch under the fault: the same lamp geometry in
 * the accent, and NO row wash. The wash is what makes a late row shout, and a
 * morning where every task is Manha-pinned would otherwise light the whole rack.
 *
 * `late` wins when a row is somehow both -- a fault outranks a prompt -- which
 * the source order here settles at equal specificity.
 */
/*
 * A SHORT field, where the fault's runs to 62%. Both rows are lit, and the one
 * that reaches further across the title is the one that went wrong -- so they
 * stay separable even when the user's accent is a red.
 */
.task.now {
  background-image: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-accent-text) 13%, transparent),
    transparent 34%
  );
}

.task.now::before {
  @apply absolute inset-y-0 pointer-events-none;
  content: '';
  left: -14px;
  width: 14px;
  border-left: 3px solid var(--color-accent-text);
  background: color-mix(in srgb, var(--color-accent-text) 20%, transparent);
}

/*
 * The pointer that makes this state legible without a word for it.
 *
 * The accent is USER-CHOSEN and can land anywhere on the wheel, including next
 * to the alarm, so hue alone cannot separate 'running' from 'missed'. Shape can:
 * the fault is a flat lit field, this is a mark aimed at one row. It sits at the
 * dial's own height, so it points at the control you would tap.
 */
.task.now::after {
  @apply absolute pointer-events-none;
  content: '';
  left: -11px;
  top: 15px;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 7px solid var(--color-accent-text);
}

/*
 * Fills the list's own left padding, so the rail, the gutter and the row's wash
 * are one continuous field rather than a red line floating off the text. Width
 * stops exactly at the content box, which is what keeps it off the title.
 */
.task.late::before {
  @apply absolute inset-y-0 pointer-events-none;
  content: '';
  left: -14px;
  width: 14px;
  border-left: 2px solid var(--color-alarm);
  background: var(--color-alarm-dim);
}

.task:last-child {
  @apply border-b-0;
}

.task-body {
  @apply flex-1 min-w-0;
}

.task-title {
  @apply text-[0.9375rem] leading-snug font-medium text-fg break-words;
}

.task-title.struck {
  @apply text-fg-faint line-through decoration-[1.5px];
  text-decoration-color: var(--color-done);
}

.task-tags {
  @apply flex flex-wrap items-center gap-1.5 mt-1.5;
}

/*
 * The latest check-off's own timestamp: small mono, led in by a short rule in
 * the done ink the way the strike runs through a finished title.
 */
.task-done-at {
  @apply flex items-center gap-1.5 mt-0.5 text-[0.6875rem] leading-none text-fg-faint;
}

.task-done-at::before {
  content: '';
  @apply inline-block w-3 h-[1.5px];
  background: var(--color-done);
}

/* Out of the routine: legible, but visibly not part of today's reading. */
.task.off .task-title {
  @apply text-fg-faint;
}

.task-off {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-fg-faint bg-well border border-line-strong px-1.5 py-0.5 rounded-[2px];
}

/*
 * Alarm, not the accent it used to wear. The accent is whatever the user picked
 * for delight, so a green one had 'Atrasada' reading as a commendation; a fault
 * has to speak in the one colour the app reserves for faults.
 */
.task-late {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-void px-1.5 py-0.5 rounded-[2px];
  background: var(--color-alarm);
}

/* A unit arriving: it slides up out of the rail rather than fading in place. */
@keyframes unit-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.task-enter-active,
.task-leave-active,
.task-move {
  transition:
    opacity 180ms ease,
    transform 240ms cubic-bezier(0.34, 1.3, 0.64, 1);
}

.task-enter-from {
  opacity: 0;
  transform: translateY(0.5rem);
}

.task-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

.task-leave-active {
  @apply absolute;
}

@media (prefers-reduced-motion: reduce) {
  .unit {
    animation: none;
  }
  .unit-fill {
    transition: none;
  }
}
</style>
