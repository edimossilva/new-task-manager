<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Task, TaskFrequency, Turn, Weekday } from '@/entities'
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  MAX_TIMES_PER_PERIOD,
  TIMES_PER_PERIOD_LABELS,
  TURNS,
  TURN_LABELS,
  TURN_RANGES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  turnPlan,
  turnSlots,
} from '@/entities'
import { useNotificationStore } from '@/stores/notification-store'
import { useTaskStore } from '@/stores/task-store'
import { useCategoryStore } from '@/stores/category-store'
import { useEntityForm } from '@/composables/use-entity-form'
import CompletionGauge from '@/components/CompletionGauge.vue'

const store = useTaskStore()
const categoryStore = useCategoryStore()
const notifications = useNotificationStore()
const router = useRouter()
const route = useRoute()

onMounted(() => {
  categoryStore.loadAll()

  // `?category=` is how a category card's + key opens this form. Checked against
  // the loaded categories, since a select whose value matches no <option>
  // renders blank -- and only for a new task, so it can never overwrite what an
  // edited one already points at.
  const preset = route.query.category
  if (isEditMode.value || typeof preset !== 'string') return
  if (categoryStore.byId.has(preset)) categoryId.value = preset
})

const { isEditMode, existing } = useEntityForm<Task>((id) => store.getById(id))

// Reaching /tasks/:id/edit with an unknown id would otherwise fall through to
// create() on submit and silently make a second task.
const notFound = computed(() => isEditMode.value && existing.value === undefined)

const title = ref('')
const description = ref('')
const frequency = ref<TaskFrequency>('daily')
// '' is the "Qualquer dia" option. <option> values are strings, so the entity's
// Weekday is produced at exactly one place, in handleSubmit.
const weekday = ref<Weekday | ''>('')
// '' is "Sem categoria"; converted to undefined at submit, like weekday.
const categoryId = ref<string>('')
// A number input hands back '' when cleared, which the use case rejects rather
// than quietly reading as 1.
const timesPerPeriod = ref<number | ''>(1)

/*
 * How many check-offs each turn claims. ONE source of truth for both input
 * shapes: the single select below is a view over this same record, so switching
 * `timesPerPeriod` between 1 and N round-trips instead of losing the setting.
 */
const turnCounts = ref<Record<Turn, number>>({ 1: 0, 2: 0, 3: 0 })

/** The plan as the entity stores it: the value repeated once per slot, ascending. */
const chosenTurns = computed<Turn[]>(() =>
  TURNS.flatMap((turn) => Array<Turn>(Math.max(0, turnCounts.value[turn])).fill(turn)),
)

/** '' is "Qualquer horario", the same sentinel the weekday select uses. */
const singleTurn = computed<Turn | ''>({
  get: () => chosenTurns.value[0] ?? '',
  set: (value) => {
    turnCounts.value = { 1: 0, 2: 0, 3: 0 }
    if (value !== '') turnCounts.value[value] = 1
  },
})

const target = computed(() => (typeof timesPerPeriod.value === 'number' ? timesPerPeriod.value : 0))

const plan = computed(() => turnPlan(chosenTurns.value, target.value))

/** Refused by `validateTurns` on submit; said here first, where it can be fixed. */
const turnsOverflow = computed(() => chosenTurns.value.length > target.value)

watch(existing, (task) => {
  if (!task) return
  title.value = task.title
  description.value = task.description ?? ''
  frequency.value = task.frequency
  weekday.value = task.weekday ?? ''
  categoryId.value = task.categoryId ?? ''
  timesPerPeriod.value = task.timesPerPeriod
})

// Preview of the strip the task will carry, so the number is a shape before it
// is a habit. Only for values the gauge can actually draw.
const previewTotal = computed(() =>
  typeof timesPerPeriod.value === 'number' &&
  Number.isInteger(timesPerPeriod.value) &&
  timesPerPeriod.value > 1 &&
  timesPerPeriod.value <= MAX_TIMES_PER_PERIOD
    ? timesPerPeriod.value
    : 0,
)

function handleSubmit() {
  if (notFound.value) return

  const chosenWeekday =
    frequency.value === 'weekly' && weekday.value !== '' ? weekday.value : undefined

  const input = {
    title: title.value,
    description: description.value.trim() || undefined,
    frequency: frequency.value,
    // Always present, never omitted: the spread below would otherwise preserve
    // the previous value instead of clearing it.
    weekday: chosenWeekday,
    // Always present for the same reason, and cleared outright when the cadence
    // is not daily: a turn is a slice of ONE day.
    turns: frequency.value === 'daily' ? chosenTurns.value : [],
    categoryId: categoryId.value || undefined,
    timesPerPeriod: timesPerPeriod.value === '' ? NaN : timesPerPeriod.value,
  }

  const saved = existing.value ? store.update({ ...existing.value, ...input }) : store.create(input)

  if (!saved) return

  // The task list hides tasks whose weekday has not come up yet, so a freshly
  // created one can be absent from the page we are about to land on. There is
  // deliberately no counterpart for turns: they never hide a task, so the same
  // toast would be noise.
  if (!existing.value && chosenWeekday !== undefined) {
    notifications.success(`Tarefa criada para ${WEEKDAY_LABELS[chosenWeekday]}.`)
  }

  router.push('/tasks')
}
</script>

<template>
  <p class="eyebrow">{{ isEditMode ? 'Editar' : 'Nova' }}</p>
  <h1>{{ isEditMode ? 'Editar Tarefa' : 'Nova Tarefa' }}</h1>

  <p v-if="notFound" class="error">Tarefa nao encontrada.</p>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>

  <form v-if="!notFound" class="sheet max-w-lg p-4 sm:p-5" @submit.prevent="handleSubmit">
    <div class="form-group">
      <label for="title">Titulo</label>
      <input id="title" v-model="title" type="text" required autofocus autocomplete="off" />
    </div>

    <div class="form-group">
      <label for="description">Descricao</label>
      <textarea id="description" v-model="description" rows="3"></textarea>
    </div>

    <div class="form-group">
      <label for="category">Categoria</label>
      <select id="category" v-model="categoryId">
        <option value="">Sem categoria</option>
        <option v-for="option in categoryStore.categories" :key="option.id" :value="option.id">
          {{ option.name }}
        </option>
      </select>
      <p v-if="categoryStore.categories.length === 0" class="hint">
        <RouterLink to="/categories/new">Crie uma categoria</RouterLink>
        para agrupar suas tarefas.
      </p>
    </div>

    <div class="form-group">
      <label for="frequency">Frequencia</label>
      <select id="frequency" v-model="frequency">
        <option v-for="option in FREQUENCIES" :key="option" :value="option">
          {{ FREQUENCY_LABELS[option] }}
        </option>
      </select>
    </div>

    <div class="form-group">
      <label for="times">{{ TIMES_PER_PERIOD_LABELS[frequency] }}</label>
      <input
        id="times"
        v-model.number="timesPerPeriod"
        type="number"
        inputmode="numeric"
        min="1"
        :max="MAX_TIMES_PER_PERIOD"
        step="1"
        required
        class="max-w-[7rem]"
      />
      <Transition name="reveal">
        <CompletionGauge
          v-if="previewTotal"
          :count="0"
          :total="previewTotal"
          :slots="frequency === 'daily' ? turnSlots(chosenTurns, previewTotal) : []"
          readonly
          class="mt-2.5"
        />
      </Transition>
      <p class="hint">
        Quantas marcacoes a tarefa precisa dentro de cada periodo. Marque cada uma tocando o
        indicador na lista.
      </p>
    </div>

    <Transition name="reveal">
      <div v-if="frequency === 'weekly'" class="form-group">
        <label for="weekday">Dia da semana</label>
        <select id="weekday" v-model="weekday">
          <option value="">Qualquer dia</option>
          <option v-for="option in WEEKDAYS" :key="option" :value="option">
            {{ WEEKDAY_LABELS[option] }}
          </option>
        </select>
        <p class="hint">A tarefa aparece a partir deste dia e vale para a semana inteira.</p>
      </div>
    </Transition>

    <!--
      Turnos are daily-only: a turn is a slice of ONE day, and a monthly target
      has no single day for a morning to be late on. One model, two input shapes
      -- the same degradation the gauge itself makes past twelve cells.
    -->
    <Transition name="reveal">
      <div v-if="frequency === 'daily'" class="form-group">
        <template v-if="target <= 1">
          <label for="turn">Turno</label>
          <select id="turn" v-model="singleTurn">
            <option value="">Qualquer horario</option>
            <option v-for="option in TURNS" :key="option" :value="option">
              {{ TURN_LABELS[option] }} ({{ TURN_RANGES[option] }})
            </option>
          </select>
        </template>

        <template v-else>
          <!-- A caption, not a label: each row's own label names its input. -->
          <p class="group-label">Turnos</p>
          <div class="turn-grid">
            <label v-for="option in TURNS" :key="option" class="turn-row">
              <span class="turn-name">{{ TURN_LABELS[option] }}</span>
              <span class="turn-range figure">{{ TURN_RANGES[option] }}</span>
              <input
                v-model.number="turnCounts[option]"
                type="number"
                inputmode="numeric"
                min="0"
                :max="target"
                step="1"
                class="turn-input"
              />
            </label>
          </div>
        </template>

        <!--
          Outside both shapes: lowering the target to 1 can leave a plan the
          single select cannot show, and a form that reads Manha while the submit
          refuses it is worse than one that says why.
        -->
        <p
          v-if="turnsOverflow || target > 1"
          class="turn-rest figure"
          :class="{ over: turnsOverflow }"
        >
          <template v-if="turnsOverflow">
            {{ chosenTurns.length }} turnos para {{ target }} marcacoes
          </template>
          <template v-else>Sem turno: {{ plan.untimed }}</template>
        </p>

        <p class="hint">
          Quando cada marcacao e esperada. A tarefa continua visivel o dia inteiro; passado o turno,
          ela aparece como atrasada.
        </p>
      </div>
    </Transition>

    <div class="flex flex-col-reverse sm:flex-row gap-2 pt-1">
      <RouterLink to="/tasks" class="btn btn-secondary">Cancelar</RouterLink>
      <button type="submit" class="btn">Salvar</button>
    </div>
  </form>
  <RouterLink v-else to="/tasks" class="btn btn-secondary">Voltar</RouterLink>
</template>

<style scoped>
@reference "../../assets/main.css";

/* Matches the global label rule: this names a group, not a control. */
.group-label {
  @apply block font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em]
         text-fg-faint mb-1.5;
}

.turn-grid {
  @apply flex flex-col gap-1.5;
}

.turn-row {
  @apply flex items-center gap-2;
}

.turn-name {
  @apply w-[4.5rem] shrink-0 text-[0.875rem] text-fg;
}

.turn-range {
  @apply flex-1 text-[0.6875rem] text-fg-faint;
}

.turn-input {
  @apply w-[4.5rem] shrink-0;
}

.turn-rest {
  @apply text-[0.75rem] text-fg-soft mt-1.5;
}

.turn-rest.over {
  color: var(--color-alarm);
}

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-accent-text mb-1;
}

.hint {
  @apply mt-1.5 text-[0.8125rem] leading-snug text-fg-faint;
}

.reveal-enter-active,
.reveal-leave-active {
  transition:
    opacity 160ms ease,
    transform 200ms ease;
}
.reveal-enter-from,
.reveal-leave-to {
  opacity: 0;
  transform: translateY(-0.375rem);
}
</style>
