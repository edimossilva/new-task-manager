<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Task } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS, formatDate } from '@/entities'
import { useAuthStore } from '@/stores/auth-store'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePeriodSelection } from '@/composables/use-period-selection'
import { buildCategoryRack } from '@/composables/use-category-rack'
import CategoryTaskCard from '@/components/CategoryTaskCard.vue'
import PeriodSelector from '@/components/PeriodSelector.vue'

const authStore = useAuthStore()
const store = useTaskStore()
const categoryStore = useCategoryStore()
const { referenceDate, isToday } = usePeriodSelection()

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

/** Atrasada, then pending, then done -- the same order the tasks page defaults to. */
function statusRank(task: Task): number {
  if (isCompleted(task)) return 2
  return store.isLateOn(task, referenceDate.value) ? 0 : 1
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
      // Rounded for display, but never up to 100 while a check is still open.
      percent:
        checks.total === 0
          ? 0
          : checks.done >= checks.total
            ? 100
            : Math.min(Math.round((checks.done / checks.total) * 100), 99),
      // Whole tasks, the other reading: eight of eight checks on one task and
      // one of eight on eight tasks are the same percentage and not the same day.
      tasks: { done: tasks.filter(isCompleted).length, total: tasks.length },
      hasRepeats: tasks.some((task) => task.timesPerPeriod > 1),
      // The rule takes the frequency's own ink, then burns off.
      ink: { '--band-ink': `var(--color-freq-${frequency})` },
      rack: buildCategoryRack(tasks, categoryStore.categories),
    }
  }).filter((band) => band.tasks.total > 0),
)

const firstName = computed(() => authStore.user?.displayName?.split(' ')[0] ?? '')
</script>

<template>
  <header class="flex items-start justify-between gap-3 mb-5">
    <div class="min-w-0">
      <p class="eyebrow">{{ isToday ? 'Hoje' : formatDate(referenceDate) }}</p>
      <h1 class="!mb-0 truncate">Ola, {{ firstName }}</h1>
    </div>
    <RouterLink to="/tasks/new" class="btn shrink-0">Nova</RouterLink>
  </header>

  <template v-if="store.tasks.length">
    <PeriodSelector />

    <!--
      A gauge cluster, one per horizon, instead of a single figure for the day:
      four dailies left and one yearly left are not the same debt, and one bar
      averaging them says neither. Each gauge is tinted with its own frequency
      ink, so a glance maps it to the band below without reading the label. The
      scale counts CHECK-OFFS, so partial progress on a repeating task shows.
    -->
    <section v-if="bands.length" class="gauges" aria-label="Progresso">
      <article v-for="band in bands" :key="band.frequency" class="gauge" :style="band.ink">
        <div class="gauge-head">
          <span class="gauge-label">{{ band.label }}</span>
          <span class="gauge-pct figure">{{ band.percent }}%</span>
        </div>
        <p class="gauge-figure figure">
          {{ band.done }}<span class="gauge-slash">/</span>{{ band.total }}
        </p>
        <div class="gauge-track">
          <div class="gauge-fill" :style="{ width: `${band.percent}%` }"></div>
        </div>
        <!--
          The foot is the task-level figure, kept because the two answer
          different questions: half the checks done can still be every task open.
        -->
        <p class="gauge-foot figure">
          <template v-if="band.done >= band.total">Tudo concluido</template>
          <template v-else-if="band.hasRepeats">
            {{ band.tasks.done }}<span class="gauge-slash">/</span>{{ band.tasks.total }} tarefas
          </template>
          <template v-else>
            {{ band.total - band.done }}
            {{ band.total - band.done === 1 ? 'restante' : 'restantes' }}
          </template>
        </p>
      </article>
    </section>

    <p v-if="bands.length === 0" class="section-empty">Nenhuma tarefa para este dia.</p>

    <!--
      One stratum per horizon. The rule is tinted with the frequency's own ink,
      so the layers are told apart before the labels are read -- and the cards
      inside keep their category inks, which is a different axis entirely.
    -->
    <section v-for="band in bands" :key="band.frequency" class="band" :style="band.ink">
      <div class="band-head">
        <h2 class="band-name">{{ band.label }}</h2>
        <span class="band-rule" aria-hidden="true"></span>
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
          compact
          hide-frequency
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

/* Gauges size themselves and wrap: one horizon or five, the cluster still reads. */
.gauges {
  @apply flex flex-wrap gap-2.5;
}

.gauge {
  @apply flex-1 basis-[150px] px-3 py-2.5 bg-panel border border-line-strong rounded-sm;
  box-shadow: var(--panel-shadow);
}

.gauge-head {
  @apply flex items-baseline justify-between gap-2;
}

.gauge-label {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em] truncate;
  color: var(--band-ink);
}

.gauge-pct {
  @apply shrink-0 text-[0.6875rem] text-fg-faint;
}

.gauge-figure {
  @apply mt-1 text-[1.5rem] leading-none font-medium text-fg;
  text-shadow: 0 0 16px color-mix(in srgb, var(--band-ink) 30%, transparent);
}

.gauge-slash {
  @apply text-fg-faint mx-0.5;
}

/* Hatched track, so an empty gauge still reads as a scale rather than a void. */
.gauge-track {
  @apply relative h-2 w-full mt-2 border border-fg overflow-hidden;
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--color-line) 3px 4px);
}

.gauge-fill {
  @apply h-full transition-[width] duration-500;
  background: var(--band-ink);
}

.gauge-foot {
  @apply mt-1.5 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-fg-faint truncate;
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
