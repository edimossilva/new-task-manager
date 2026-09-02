<script setup lang="ts">
import { computed, useId } from 'vue'
import { MONTH_NAMES, daysInMonth, formatDate } from '@/entities'
import { usePeriodStore } from '@/stores/period-store'
import { usePeriodSelection } from '@/composables/use-period-selection'

const store = usePeriodStore()
const { referenceDate, isToday } = usePeriodSelection()

const dayId = useId()
const monthId = useId()
const yearId = useId()

// Getters read the effective date, so with nothing pinned the selects show
// today. Setters go through the store, which clamps the day.
const day = computed({
  get: () => referenceDate.value.getDate(),
  set: (value: number) => store.setDay(value),
})

const month = computed({
  get: () => referenceDate.value.getMonth() + 1,
  set: (value: number) => store.setMonth(value),
})

const year = computed({
  get: () => referenceDate.value.getFullYear(),
  set: (value: number) => store.setYear(value),
})

// Trimming these AND clamping the stored day are both required: an out-of-range
// value with no matching option renders the select blank.
const dayOptions = computed(() =>
  Array.from({ length: daysInMonth(year.value, month.value) }, (_, index) => index + 1),
)

const yearOptions = computed(() =>
  Array.from(
    { length: store.lastYear - store.firstYear + 1 },
    (_, index) => store.firstYear + index,
  ),
)
</script>

<template>
  <div class="flex flex-wrap items-end gap-4 mb-2">
    <div>
      <label :for="dayId">Dia</label>
      <select :id="dayId" v-model.number="day" class="select-compact">
        <option v-for="option in dayOptions" :key="option" :value="option">{{ option }}</option>
      </select>
    </div>
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
        <option v-for="option in yearOptions" :key="option" :value="option">{{ option }}</option>
      </select>
    </div>

    <div class="flex items-center gap-1">
      <button
        type="button"
        class="step-btn"
        title="Dia anterior"
        aria-label="Dia anterior"
        :disabled="!store.canStep(-1)"
        @click="store.step(-1)"
      >
        &lsaquo;
      </button>
      <button
        type="button"
        class="step-btn"
        title="Proximo dia"
        aria-label="Proximo dia"
        :disabled="!store.canStep(1)"
        @click="store.step(1)"
      >
        &rsaquo;
      </button>
    </div>

    <button
      type="button"
      class="btn btn-secondary"
      title="Voltar para hoje"
      :disabled="isToday"
      @click="store.clear()"
    >
      Hoje
    </button>

    <p v-if="!isToday" class="text-[0.8125rem] text-text-muted mb-1.5">
      Vendo o dia {{ formatDate(referenceDate) }}
    </p>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.step-btn {
  @apply w-7 h-7 flex items-center justify-center text-base leading-none font-semibold
         text-text-secondary bg-surface border border-border rounded-sm cursor-pointer
         transition-[color,background,border-color] duration-[120ms];
}
.step-btn:hover:not(:disabled) {
  @apply text-primary bg-surface-hover border-border-hover;
}
.step-btn:disabled {
  @apply opacity-40 cursor-not-allowed;
}
</style>
