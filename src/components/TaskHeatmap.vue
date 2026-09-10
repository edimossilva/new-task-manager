<script setup lang="ts">
import { computed } from 'vue'
import type { HeatCell } from '@/usecases'
import { MONTH_SHORT, WEEKDAY_SHORT, formatDate, periodKey } from '@/entities'

const props = defineProps<{ cells: HeatCell[] }>()

const todayKey = periodKey('daily', new Date())

const columns = computed(() => props.cells.length / 7)

/**
 * A month name over the column where that month STARTS, the way a calendar
 * names a page. Anything denser would print `Set` five times in a row; the
 * first column is always named, or the strip would open unlabelled.
 */
const months = computed(() =>
  Array.from({ length: columns.value }, (_, column) => {
    const monday = props.cells[column * 7]?.date
    const previous = column === 0 ? undefined : props.cells[(column - 1) * 7]?.date
    if (!monday) return ''
    if (previous && previous.getMonth() === monday.getMonth()) return ''
    return MONTH_SHORT[monday.getMonth()] ?? ''
  }),
)

/**
 * Four steps and an overflow, because a heatmap with a continuous ramp is a
 * gradient nobody can read back into numbers. The ratio is against the task's
 * own target, so a task wanting eight check-offs a day is not permanently pale.
 */
function level(cell: HeatCell): number {
  if (cell.count === 0) return 0
  const ratio = cell.count / cell.target
  if (ratio >= 1.5) return 4
  if (ratio >= 1) return 3
  if (ratio >= 0.5) return 2
  return 1
}

function title(cell: HeatCell): string {
  return `${formatDate(cell.date)}: ${cell.count}/${cell.target}`
}
</script>

<template>
  <div class="heat">
    <!-- Three of the seven rows are named. All seven would be a wall of text
         beside cells nine pixels tall. -->
    <div class="rows" aria-hidden="true">
      <span v-for="weekday in [1, 3, 5] as const" :key="weekday" :style="{ '--row': weekday }">
        {{ WEEKDAY_SHORT[weekday] }}
      </span>
    </div>

    <div class="plot">
      <div class="months" :style="{ '--cols': columns }" aria-hidden="true">
        <span v-for="(month, index) in months" :key="index">{{ month }}</span>
      </div>

      <div class="grid" :style="{ '--cols': columns }">
        <span
          v-for="cell in cells"
          :key="cell.key"
          class="cell"
          :class="[
            `l${level(cell)}`,
            { blank: !cell.existed || cell.isFuture, today: cell.key === todayKey },
          ]"
          :title="title(cell)"
        ></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.heat {
  @apply flex gap-1.5;
}

/* The labels sit on the same seven-row grid as the cells, so they cannot drift
   out of line with the rows they name. */
.rows {
  @apply grid shrink-0 gap-[2px] pt-4;
  grid-template-rows: repeat(7, 1fr);
}

.rows span {
  @apply flex items-center font-mono text-[0.5rem] uppercase tracking-[0.06em] text-fg-faint;
  grid-row: var(--row);
}

/* Capped: past about 26px a heatmap cell stops reading as a cell in a season
   and starts reading as a tile in a calendar. */
.plot {
  @apply flex-1 min-w-0;
  max-width: 34rem;
}

.months {
  @apply grid h-4 gap-[2px];
  grid-template-columns: repeat(var(--cols), 1fr);
}

.months span {
  @apply font-mono text-[0.5rem] uppercase tracking-[0.08em] text-fg-faint;
}

/*
 * Column by column, a week per column, Monday at the top -- the order the use
 * case builds the cells in, so the grid needs no sorting of its own.
 */
.grid {
  @apply grid gap-[2px];
  /* `auto`, not `1fr`: the rows take their height from the square cells, and
     the label column beside them stretches to match. */
  grid-template-rows: repeat(7, auto);
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-auto-flow: column;
}

.cell {
  @apply block w-full;
  aspect-ratio: 1;
  border-radius: 1px;
  /* Empty, but still a slot: a well-coloured ground under the same hatch every
     track in the app wears, so the season reads as a grid of days rather than
     as scattered marks on nothing. */
  background-color: var(--color-well);
  background-image: repeating-linear-gradient(45deg, transparent 0 2px, var(--color-line) 2px 3px);
  animation: cell-in 300ms ease both;
}

.cell.l1 {
  background-color: color-mix(in srgb, var(--color-done) 28%, var(--color-well));
  background-image: none;
}

.cell.l2 {
  background-color: color-mix(in srgb, var(--color-done) 55%, var(--color-well));
  background-image: none;
}

.cell.l3 {
  background-color: var(--color-done);
  background-image: none;
}

/* Past the target: the same ground with a bloom, so a heavy day is legible as
   more than a full one without inventing a colour that means nothing else. */
.cell.l4 {
  background-color: var(--color-done);
  background-image: none;
  box-shadow: 0 0 6px var(--color-done);
}

/* Before the task existed, or after today: not a miss, so not a slot either. */
.cell.blank {
  @apply opacity-25;
}

.cell.today {
  outline: 1px solid var(--color-accent);
  outline-offset: 1px;
}

@keyframes cell-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}
</style>
