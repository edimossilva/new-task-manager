<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  isSameDay,
  isoWeekday,
  type Weekday,
} from '@/entities'
import { usePeriodStore } from '@/stores/period-store'
import { usePeriodSelection } from '@/composables/use-period-selection'

const store = usePeriodStore()
const { referenceDate, today, isToday } = usePeriodSelection()

const monthId = useId()
const yearId = useId()
const showJump = ref(false)

/**
 * The ISO week containing the selected day, Monday first.
 *
 * This is not decoration: weekly tasks are keyed on the ISO week, so the strip
 * is exactly the span one weekly completion covers.
 */
const weekDays = computed(() => {
  const monday = new Date(referenceDate.value)
  monday.setDate(monday.getDate() - (isoWeekday(monday) - 1))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return date
  })
})

const monthLabel = computed(
  () => `${MONTH_NAMES[referenceDate.value.getMonth()]} ${referenceDate.value.getFullYear()}`,
)

const month = computed({
  get: () => referenceDate.value.getMonth() + 1,
  set: (value: number) => store.setMonth(value),
})

const year = computed({
  get: () => referenceDate.value.getFullYear(),
  set: (value: number) => store.setYear(value),
})

const yearOptions = computed(() =>
  Array.from(
    { length: store.lastYear - store.firstYear + 1 },
    (_, index) => store.firstYear + index,
  ),
)

function inRange(date: Date): boolean {
  return date.getFullYear() >= store.firstYear && date.getFullYear() <= store.lastYear
}
</script>

<template>
  <section class="dial" aria-label="Periodo">
    <div class="dial-head">
      <button
        type="button"
        class="arrow"
        title="Dia anterior"
        aria-label="Dia anterior"
        :disabled="!store.canStep(-1)"
        @click="store.step(-1)"
      >
        &lsaquo;
      </button>

      <button
        type="button"
        class="month-btn"
        :aria-expanded="showJump"
        @click="showJump = !showJump"
      >
        {{ monthLabel }}
        <span class="month-caret" :class="{ open: showJump }">&#9662;</span>
      </button>

      <button
        type="button"
        class="arrow"
        title="Proximo dia"
        aria-label="Proximo dia"
        :disabled="!store.canStep(1)"
        @click="store.step(1)"
      >
        &rsaquo;
      </button>

      <button
        type="button"
        class="today-btn"
        title="Voltar para hoje"
        :disabled="isToday"
        @click="store.clear()"
      >
        Hoje
      </button>
    </div>

    <!-- The week strip: seven thumb-sized targets, no dropdown to open. -->
    <ol class="strip">
      <li v-for="date in weekDays" :key="date.toISOString()">
        <button
          type="button"
          class="chip"
          :class="{
            'is-selected': isSameDay(date, referenceDate),
            'is-today': isSameDay(date, today),
          }"
          :disabled="!inRange(date)"
          :aria-current="isSameDay(date, referenceDate) ? 'date' : undefined"
          :aria-label="`${WEEKDAY_LABELS[isoWeekday(date) as Weekday]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`"
          @click="store.setDate(date)"
        >
          <span class="chip-dow">{{ WEEKDAY_SHORT[isoWeekday(date) as Weekday] }}</span>
          <span class="chip-num">{{ date.getDate() }}</span>
        </button>
      </li>
    </ol>

    <Transition name="jump">
      <div v-if="showJump" class="jump">
        <div>
          <label :for="monthId">Mes</label>
          <select :id="monthId" v-model.number="month" class="select-compact">
            <option v-for="(name, index) in MONTH_NAMES" :key="name" :value="index + 1">
              {{ name }}
            </option>
          </select>
        </div>
        <div>
          <label :for="yearId">Ano</label>
          <select :id="yearId" v-model.number="year" class="select-compact">
            <option v-for="option in yearOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
@reference "../assets/main.css";

.dial {
  @apply mb-5;
}

.dial-head {
  @apply flex items-center gap-1 mb-2;
}

.arrow {
  @apply flex items-center justify-center w-11 h-11 shrink-0 text-xl leading-none
         text-ink bg-transparent border border-transparent rounded-sm cursor-pointer
         transition-[color,background,border-color] duration-[120ms];
  -webkit-tap-highlight-color: transparent;
}
.arrow:hover:not(:disabled) {
  @apply bg-paper-sunk border-rule-strong;
}
.arrow:disabled {
  @apply opacity-25 cursor-not-allowed;
}

.month-btn {
  @apply flex items-baseline gap-1.5 min-h-11 px-1 font-display text-[1.15rem] font-semibold
         tracking-[-0.01em] text-ink bg-transparent border-none cursor-pointer;
  font-variation-settings:
    'SOFT' 20,
    'WONK' 1;
}
.month-btn:hover {
  @apply text-flare-deep;
}

.month-caret {
  @apply text-[0.6rem] text-ink-faint transition-transform duration-200;
}
.month-caret.open {
  @apply rotate-180;
}

.today-btn {
  @apply ml-auto shrink-0 min-h-11 px-3 font-mono text-[0.625rem] font-medium uppercase
         tracking-[0.12em] text-ink bg-paper-raised border border-ink rounded-sm
         cursor-pointer transition-opacity duration-[120ms];
}
.today-btn:disabled {
  @apply opacity-25 cursor-not-allowed;
}

/* Seven columns, always: it is a week, so it should never wrap or scroll. */
.strip {
  @apply grid grid-cols-7 gap-1;
}

.chip {
  @apply w-full flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-14
         bg-paper-raised border border-rule-strong rounded-sm cursor-pointer
         transition-[background,border-color,color,transform] duration-[120ms];
  -webkit-tap-highlight-color: transparent;
}
.chip:hover:not(:disabled):not(.is-selected) {
  @apply border-ink bg-paper-sunk;
}
.chip:disabled {
  @apply opacity-30 cursor-not-allowed;
}

.chip-dow {
  @apply font-mono text-[0.5625rem] font-medium uppercase tracking-[0.1em] text-ink-faint;
}

.chip-num {
  @apply font-display text-[1.05rem] leading-none font-semibold text-ink;
}

/* Today is marked in flare even when it is not the day being viewed. */
.chip.is-today .chip-num {
  @apply text-flare-deep;
}
.chip.is-today {
  @apply border-flare;
}

.chip.is-selected {
  @apply bg-ink border-ink;
  box-shadow: var(--shadow-stamp-sm);
}
.chip.is-selected .chip-dow {
  @apply text-paper opacity-70;
}
.chip.is-selected .chip-num {
  @apply text-paper;
}
.chip.is-selected.is-today .chip-num {
  @apply text-flare;
}

.jump {
  @apply flex flex-wrap items-end gap-3 mt-3 p-3 bg-paper-raised
         border border-rule-strong rounded-sm;
}

.jump-enter-active,
.jump-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms ease;
}
.jump-enter-from,
.jump-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}
</style>
