<script setup lang="ts">
import { computed } from 'vue'
import type { Category, Task } from '@/entities'
import { INKS, formatDate, formatPeriodLabel, matchesFrequency } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import FrequencyBadge from '@/components/FrequencyBadge.vue'
import WeekdayBadge from '@/components/WeekdayBadge.vue'
import TaskStamp from '@/components/TaskStamp.vue'
import CompletionGauge from '@/components/CompletionGauge.vue'

const props = withDefaults(
  defineProps<{
    /** Absent for the unfiled unit, which is a real bucket rather than a category. */
    category?: Category
    tasks: Task[]
    /** Position in the rack, used only to stagger the reveal. */
    index: number
    /**
     * The home page's density: no description, no last-completion meta, no row
     * actions. Only the rows change; the head and its meter are the unit's
     * identity and read the same on both pages.
     */
    compact?: boolean
    /**
     * Drops the frequency badge, for a caller whose own heading already states
     * it. Separate from `compact` because home's top band holds two
     * frequencies, and there the badge is the only thing telling them apart.
     */
    hideFrequency?: boolean
  }>(),
  { compact: false, hideFrequency: false },
)

defineEmits<{ delete: [id: string] }>()

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
 * a plain count, the same figure the compact head shows.
 */
const activeTasks = computed(() => props.tasks.filter((task) => task.active))
const doneCount = computed(() => activeTasks.value.filter(isCompleted).length)
const hasRatio = computed(() => activeTasks.value.length > 0)
const progress = computed(() =>
  activeTasks.value.length === 0 ? 0 : (doneCount.value / activeTasks.value.length) * 100,
)

/**
 * The latest completion written under the task's CURRENT frequency.
 *
 * A frequency change leaves keys of the old format behind, and mixed formats do
 * not sort chronologically -- within one year a weekly key outsorts every daily
 * key -- so the raw last element can be a stale key from the old format.
 */
function lastCompletion(task: Task): string {
  const own = task.completions.filter((entry) => matchesFrequency(task.frequency, entry.key))
  const key = own[own.length - 1]?.key
  // Empty rather than a dash: a row that has never been ticked should say
  // nothing there, not print a placeholder in every card on the page.
  if (!key) return ''
  // The real today, not the browsed date: otherwise an August key would be
  // labelled 'Hoje' while browsing August.
  return formatPeriodLabel(task.frequency, key, today.value)
}
</script>

<template>
  <!--
    A rack unit: the category's ink runs down the left edge and tints the head,
    the readout under it is that category's own progress for the browsed period,
    and the tasks are the ruled rows of the module.
  -->
  <section
    class="unit"
    :class="{ unfiled: !category, compact }"
    :style="{ ...inkVars, '--i': index }"
  >
    <header class="unit-head">
      <h2 class="unit-name ink-text" :title="category?.description || undefined">
        {{ category?.name ?? 'Sem categoria' }}
      </h2>
      <span v-if="hasRatio" class="unit-count figure">
        {{ doneCount }}<span class="unit-slash">/</span>{{ activeTasks.length }}
        <span class="sr-only">concluidas</span>
      </span>
      <span v-else class="unit-count figure">
        {{ tasks.length }}
        <span class="sr-only">{{ tasks.length === 1 ? 'tarefa' : 'tarefas' }}</span>
      </span>
      <!--
        The new-task key sits in the head, where the category is already named,
        so the form opens with this one chosen. On the unfiled unit it opens
        with none, which is exactly what that unit collects.
      -->
      <RouterLink
        v-if="!compact"
        class="unit-add"
        :to="category ? { path: '/tasks/new', query: { category: category.id } } : '/tasks/new'"
        :aria-label="`Nova tarefa em ${category?.name ?? 'Sem categoria'}`"
        :title="`Nova tarefa em ${category?.name ?? 'Sem categoria'}`"
      >
        +
      </RouterLink>
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
          <!--
            The title is the way into the task's own page, where its history is.
            A third action link per row would have cost more width than the row
            has; the title was already the thing being pointed at.
          -->
          <p class="task-title" :class="{ struck: isCompleted(task) }">
            <RouterLink v-if="!compact" :to="`/tasks/${task.id}`" class="task-link">
              {{ task.title }}
            </RouterLink>
            <template v-else>{{ task.title }}</template>
          </p>
          <p v-if="task.description && !compact" class="task-desc">{{ task.description }}</p>

          <CompletionGauge
            v-if="task.timesPerPeriod > 1"
            :count="countOf(task)"
            :total="task.timesPerPeriod"
            class="mt-1"
            @set="(count) => store.setCompletionCount(task.id, count, referenceDate)"
            @undo="store.undoCompletion(task.id, referenceDate)"
          />

          <!--
            Tags and actions share one baseline instead of the actions standing
            in a column of their own: a stacked pair of 44px links made every
            row twice as tall as its content and cost the card 110px of width it
            does not have three-across.
          -->
          <div class="task-foot">
            <div class="task-tags">
              <FrequencyBadge v-if="!hideFrequency" :frequency="task.frequency" />
              <WeekdayBadge v-if="task.weekday" :weekday="task.weekday" />
              <span v-if="!task.active" class="task-off">Inativa</span>
              <span v-else-if="isLate(task)" class="task-late">Atrasada</span>
              <span v-if="!compact && lastCompletion(task)" class="task-meta figure">
                {{ lastCompletion(task) }}
              </span>
            </div>

            <div v-if="!compact" class="task-actions">
              <!--
                Icons, not words: three labelled links would have cost more
                width than a row has three-across, and these three actions are
                the same three on every row -- there is nothing to read twice.
              -->
              <!--
                Power, not a checkbox: taking a task out of the routine is a
                state the row wears, and the same key puts it back.
              -->
              <button
                type="button"
                class="task-action"
                :class="{ lit: !task.active }"
                :aria-pressed="!task.active"
                :aria-label="`${task.active ? 'Desativar' : 'Ativar'} ${task.title}`"
                :title="task.active ? 'Desativar' : 'Ativar'"
                @click="store.setActive(task.id, !task.active)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 2.3v4.5" />
                  <path d="M4.9 4.5a5 5 0 1 0 6.2 0" />
                </svg>
              </button>

              <RouterLink
                :to="`/tasks/${task.id}`"
                class="task-action"
                :aria-label="`Detalhes de ${task.title}`"
                title="Detalhes e historico"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.25" />
                  <path d="M8 7.4v4.1" />
                  <circle class="solid" cx="8" cy="4.7" r="0.9" />
                </svg>
              </RouterLink>

              <RouterLink
                :to="`/tasks/${task.id}/edit`"
                class="task-action"
                :aria-label="`Editar ${task.title}`"
                title="Editar"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M10.9 2.6 13.4 5.1 5.7 12.8 2.6 13.4 3.2 10.3z" />
                  <path d="M9.5 4 12 6.5" />
                </svg>
              </RouterLink>

              <button
                type="button"
                class="task-action danger"
                :aria-label="`Excluir ${task.title}`"
                title="Excluir"
                @click="$emit('delete', task.id)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2.8 4.3h10.4" />
                  <path d="M4.4 4.3 5.1 13.2h5.8l.7-8.9" />
                  <path d="M6.2 4.3V2.8h3.6v1.5" />
                  <path d="M6.7 6.6v4.3M9.3 6.6v4.3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
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
  @apply !mb-0 font-display text-[0.9375rem] font-semibold uppercase tracking-[0.1em]
         truncate;
}

.unit.unfiled .unit-name {
  @apply text-fg-faint;
}

.unit-count {
  @apply shrink-0 text-[0.8125rem] text-fg-soft;
}

.unit-add {
  @apply flex items-center justify-center w-7 h-7 shrink-0 -my-1 font-mono text-[1rem]
         leading-none text-fg-faint bg-well border border-line-strong no-underline
         transition-[color,border-color] duration-[140ms];
  border-radius: 2px;
  -webkit-tap-highlight-color: transparent;
}

.unit-add:hover {
  @apply text-accent-text border-accent-text;
}

.unit-add:focus-visible {
  @apply outline-none border-accent;
  box-shadow: 0 0 0 3px var(--color-accent-dim);
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
  @apply flex items-start gap-3 py-3 border-b border-line;
}

.unit.compact .task {
  @apply py-2;
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

.task-link {
  @apply text-fg no-underline transition-colors duration-[140ms];
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
}

.task-link:hover {
  @apply text-accent-text;
  text-decoration-color: currentColor;
}

.task-title.struck .task-link {
  @apply text-fg-faint;
}

.task-title.struck {
  @apply text-fg-faint line-through decoration-[1.5px];
  text-decoration-color: var(--color-done);
}

.task-desc {
  @apply mt-0.5 text-[0.8125rem] leading-snug text-fg-faint break-words;
}

.task-foot {
  @apply flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5;
}

.task-tags {
  @apply flex flex-wrap items-center gap-1.5;
}

/* Out of the routine: legible, but visibly not part of today's reading. */
.task.off .task-title,
.task.off .task-desc {
  @apply text-fg-faint;
}

.task-off {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-fg-faint bg-well border border-line-strong px-1.5 py-0.5 rounded-[2px];
}

.task-action.lit {
  @apply text-accent-text;
}

.task-late {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-void bg-accent-text px-1.5 py-0.5 rounded-[2px];
}

.task-meta {
  @apply text-[0.6875rem] text-fg-faint;
}

.task-actions {
  @apply flex items-center shrink-0 ml-auto -mr-1.5 -my-1;
}

/* One control shape for the row's three actions: a 44px-tall target that shows
   as a 17px glyph, so the row reads as content with affordances, not a toolbar. */
.task-action {
  @apply inline-flex items-center justify-center w-8 min-h-11 shrink-0 bg-transparent
         border-none cursor-pointer text-fg-faint transition-colors duration-[140ms];
  -webkit-tap-highlight-color: transparent;
}

.task-action svg {
  @apply w-[17px] h-[17px];
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.task-action svg .solid {
  fill: currentColor;
  stroke: none;
}

.task-action:hover,
.task-action:focus-visible {
  @apply outline-none text-accent-text;
}

.task-action.danger:hover,
.task-action.danger:focus-visible {
  color: var(--color-alarm);
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
