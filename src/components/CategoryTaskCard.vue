<script setup lang="ts">
import { computed } from 'vue'
import type { Category, Task } from '@/entities'
import { INKS, formatDate } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TaskStamp from '@/components/TaskStamp.vue'
import CompletionGauge from '@/components/CompletionGauge.vue'
import TaskInfoLink from '@/components/TaskInfoLink.vue'
import CategoryInfoLink from '@/components/CategoryInfoLink.vue'

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
}>()

const store = useTaskStore()
const { referenceDate } = usePeriodSelection()

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

function isCompleted(task: Task): boolean {
  return store.isCompletedFor(task, referenceDate.value)
}

function isLate(task: Task): boolean {
  return store.isLateOn(task, referenceDate.value)
}

function countOf(task: Task): number {
  return store.completionCountFor(task, referenceDate.value)
}

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
const activeTasks = computed(() => props.tasks.filter((task) => task.active))
const checks = computed(() => store.checkTally(activeTasks.value, referenceDate.value))
const hasRatio = computed(() => activeTasks.value.length > 0)
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
  <section class="unit" :class="{ unfiled: !category }" :style="{ ...inkVars, '--i': index }">
    <header class="unit-head">
      <!-- The head names the category and is the way into its page; the
           unfiled bucket is not a category and has none. -->
      <h2 class="unit-name ink-text" :title="category?.description || undefined">
        <RouterLink v-if="category" :to="`/categories/${category.id}`" class="unit-link">
          {{ category.name }}
        </RouterLink>
        <template v-else>Sem categoria</template>
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
      <li v-for="task in tasks" :key="task.id" class="task" :class="{ off: !task.active }">
        <TaskStamp
          :task="task"
          :count="countOf(task)"
          :period-label="formatDate(referenceDate)"
          :disabled="!task.active"
          @advance="store.advanceCompletion(task.id, referenceDate)"
        />

        <div class="task-body">
          <p class="task-title" :class="{ struck: isCompleted(task) }">{{ task.title }}</p>

          <CompletionGauge
            v-if="task.timesPerPeriod > 1"
            :count="countOf(task)"
            :total="task.timesPerPeriod"
            class="mt-1"
            @set="(count) => store.setCompletionCount(task.id, count, referenceDate)"
            @undo="store.undoCompletion(task.id, referenceDate)"
          />

          <!-- Dropped entirely when there is nothing to say, rather than
               spending its top margin on an empty line. -->
          <div v-if="task.weekday || !task.active || isLate(task)" class="task-tags">
            <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
            <span v-if="!task.active" class="task-off">Inativa</span>
            <span v-else-if="isLate(task)" class="task-late">Atrasada</span>
          </div>
        </div>

        <!--
          The only action the rack carries: the way into the task's own page,
          where the history and the rest of the controls are. Reading is safe
          from a page whose job is ticking things off; editing and deleting
          belong to the registry. Pulled up out of the row's padding so a 44px
          target does not make every row taller than its stamp.
        -->
        <TaskInfoLink :task="task" class="-my-2 -mr-1.5" />
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
  @apply flex items-start gap-3 py-2 border-b border-line;
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

/* Out of the routine: legible, but visibly not part of today's reading. */
.task.off .task-title {
  @apply text-fg-faint;
}

.task-off {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-fg-faint bg-well border border-line-strong px-1.5 py-0.5 rounded-[2px];
}

.task-late {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-void bg-accent-text px-1.5 py-0.5 rounded-[2px];
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
