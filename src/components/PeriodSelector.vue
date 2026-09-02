<script setup lang="ts">
import { computed, useId } from 'vue'
import { MONTH_NAMES, daysInMonth, formatDate } from '@/entities'
import { usePeriodStore } from '@/stores/period-store'
import { usePeriodSelection } from '@/composables/use-period-selection'

const YEARS_BACK = 2

const store = usePeriodStore()
const { referenceDate, today, isToday } = usePeriodSelection()

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

const yearOptions = computed(() => {
  const latest = today.value.getFullYear()
  return Array.from({ length: YEARS_BACK + 1 }, (_, index) => latest - YEARS_BACK + index)
})
</script>

<template>
  <div class="flex flex-wrap items-end gap-4 mb-2">
    <div>
      <label :for="dayId">Dia</label>
      <select :id="dayId" v-model.number="day" class="!w-auto !py-1 !px-2 text-[0.8125rem]">
        <option v-for="option in dayOptions" :key="option" :value="option">{{ option }}</option>
      </select>
    </div>
    <div>
      <label :for="monthId">Mes</label>
      <select :id="monthId" v-model.number="month" class="!w-auto !py-1 !px-2 text-[0.8125rem]">
        <option v-for="(name, index) in MONTH_NAMES" :key="name" :value="index + 1">
          {{ name }}
        </option>
      </select>
    </div>
    <div>
      <label :for="yearId">Ano</label>
      <select :id="yearId" v-model.number="year" class="!w-auto !py-1 !px-2 text-[0.8125rem]">
        <option v-for="option in yearOptions" :key="option" :value="option">{{ option }}</option>
      </select>
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
