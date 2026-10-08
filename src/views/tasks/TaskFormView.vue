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
  isSubtask,
  parentIds,
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

// `?parent=` is the counterpart, and how a task's own page opens this form for
// a new step. Checked against the loaded tasks for the same reason, and only
// for a new one, so an edited task's own filing is never overwritten.
onMounted(() => {
  store.loadAll()

  const preset = route.query.parent
  if (isEditMode.value || typeof preset !== 'string') return
  if (parentOptions.value.some((option) => option.id === preset)) parentId.value = preset
})

const { isEditMode, existing } = useEntityForm<Task>((id) => store.getById(id))

// Reaching /tasks/:id/edit with an unknown id would otherwise fall through to
// create() on submit and silently make a second task.
const notFound = computed(() => isEditMode.value && existing.value === undefined)

const title = ref('')
const description = ref('')
// Both read by `saveAndNew`, which is the whole reason they exist: it leaves the
// form MOUNTED, so nothing else would run the field checks a submit runs, and
// nothing else would move the caret back up to the first field.
const titleInput = ref<HTMLInputElement | null>(null)
const formEl = ref<HTMLFormElement | null>(null)
const frequency = ref<TaskFrequency>('daily')
// '' is the "Qualquer dia" option. <option> values are strings, so the entity's
// Weekday is produced at exactly one place, in handleSubmit.
const weekday = ref<Weekday | ''>('')
// '' is "Sem categoria"; converted to undefined at submit, like weekday.
const categoryId = ref<string>('')
// '' is "Nenhuma": a task that stands alone. Same sentinel as the two above.
const parentId = ref<string>('')
// A number input hands back '' when cleared, which the use case rejects rather
// than quietly reading as 1.
const timesPerPeriod = ref<number | ''>(1)
// In the routine unless said otherwise. Seeded from the task when editing, so
// saving without touching the box changes nothing.
const active = ref(true)
// Asked for unless said otherwise. The step's OWN, never inherited: how much is
// wanted of a step is a property of the step, the trade `timesPerPeriod` and
// `turns` already make.
const optional = ref(false)

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

const parents = computed(() => parentIds(store.tasks))

/**
 * How many steps each task already holds, resolved in ONE pass. Both the select
 * below and `childCount` read it, so the figure the option prints and the one
 * the Subtarefas block prints cannot disagree -- and the option list no longer
 * filters the whole set once per row.
 */
const stepCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const task of store.tasks) {
    if (task.parentId) counts.set(task.parentId, (counts.get(task.parentId) ?? 0) + 1)
  }
  return counts
})

/**
 * Every task this one could be filed under: not a step itself (the model is one
 * level deep) and not this task, which would be a container holding itself.
 *
 * Each carries the count of steps already under it, because the list mixes two
 * different things -- routines that are already headings, and ordinary tasks
 * that would BECOME one by this choice. A title alone cannot say which, and the
 * difference is what filing the task actually does: a container stops counting
 * for itself. Nothing is printed at zero, where a `0 subtarefas` on every
 * ordinary row would be noise on the majority of the list.
 */
const parentOptions = computed(() =>
  store.tasks
    .filter((task) => !isSubtask(task, parents.value) && task.id !== existing.value?.id)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((task) => {
      const steps = stepCounts.value.get(task.id) ?? 0
      const suffix = steps === 1 ? '1 subtarefa' : `${steps} subtarefas`
      return { id: task.id, label: steps ? `${task.title} (${suffix})` : task.title }
    }),
)

const parent = computed(() => (parentId.value ? store.getById(parentId.value) : undefined))

/**
 * The steps already filed under the task being edited. Counted off `store.tasks`
 * rather than through the repository, so the block below re-reads itself when
 * one is added or deleted.
 */
const childCount = computed(() =>
  existing.value ? (stepCounts.value.get(existing.value.id) ?? 0) : 0,
)

/** This task already holds steps, so it can neither be filed nor checked off. */
const holdsSteps = computed(() => childCount.value > 0)

const target = computed(() => (typeof timesPerPeriod.value === 'number' ? timesPerPeriod.value : 0))

const plan = computed(() => turnPlan(chosenTurns.value, target.value))

/** Refused by `validateTurns` on submit; said here first, where it can be fixed. */
const turnsOverflow = computed(() => chosenTurns.value.length > target.value)

/*
 * A step lives where its container lives, and the use case enforces that
 * whatever the form sends. Mirroring it here is so the form never SHOWS a value
 * it is about to overwrite -- the fields stay disabled beside it, saying which
 * they are rather than going blank.
 */
watch(parent, (task) => {
  if (!task) return
  frequency.value = task.frequency
  weekday.value = task.weekday ?? ''
  categoryId.value = task.categoryId ?? ''
})

watch(existing, (task) => {
  if (!task) return
  title.value = task.title
  description.value = task.description ?? ''
  frequency.value = task.frequency
  weekday.value = task.weekday ?? ''
  categoryId.value = task.categoryId ?? ''
  parentId.value = task.parentId ?? ''
  timesPerPeriod.value = task.timesPerPeriod
  active.value = task.active
  optional.value = task.optional
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

/**
 * Writes the form and says whether it landed, so the two ways out can share it:
 * Salvar, and the key that opens a new step under this task. That key has to
 * save FIRST -- leaving an edit form by a plain link would drop whatever is on
 * it, and nothing in this app discards work silently.
 */
function persist(): boolean {
  if (notFound.value) return false

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
    // Always present, for the reason stated above: the spread below preserves
    // an omitted key, so leaving it off would make "remove the parent"
    // impossible to express.
    parentId: parentId.value || undefined,
    timesPerPeriod: timesPerPeriod.value === '' ? NaN : timesPerPeriod.value,
    active: active.value,
    // Always present, for the reason stated above: the spread below preserves
    // an omitted key, so clearing the box has to be expressible.
    optional: optional.value,
  }

  const saved = existing.value ? store.update({ ...existing.value, ...input }) : store.create(input)

  if (!saved) return false

  // The task list hides tasks whose weekday has not come up yet, so a freshly
  // created one can be absent from the page we are about to land on. There is
  // deliberately no counterpart for turns: they never hide a task, so the same
  // toast would be noise.
  if (!existing.value && chosenWeekday !== undefined) {
    notifications.success(`Tarefa criada para ${WEEKDAY_LABELS[chosenWeekday]}.`)
  }

  return true
}

function handleSubmit() {
  if (persist()) router.push('/tasks')
}

/**
 * Save, then hand back an empty form still carrying this one's SETTINGS.
 *
 * Filing a routine's steps is several tasks that differ only by name -- same
 * container, same category, same cadence, often the same target -- and leaving
 * by Salvar makes each one a round trip through /tasks and five selects. So
 * only `title` and `description` are cleared: they are what distinguishes one
 * task from the next, and everything else is the context the next one shares.
 *
 * Create mode only. An edit form already has its own second way out (`Nova
 * subtarefa`), and `persist` would UPDATE rather than create, which is not what
 * the word "outra" promises.
 */
function saveAndNew() {
  // Asked for by hand because the key is deliberately NOT a submit button: a
  // second submit button placed before Salvar would become the form's DEFAULT
  // one, and pressing Enter in the title field would quietly start meaning
  // "and another". So the key gives up the native check and takes it back
  // here, which is also where the empty title is caught -- the use case's
  // refusal renders at the TOP of a form whose foot is what you are looking at.
  if (!formEl.value?.reportValidity()) return
  if (!persist()) return

  title.value = ''
  description.value = ''
  // Focus scrolls the field into view, which is also how the form says it
  // reset: the toast says the task landed, the caret says where the next one
  // goes.
  titleInput.value?.focus()
}

/**
 * Save, then open the new step's form already filed under this task.
 *
 * Reachable only while no parent is selected ABOVE: the model is one level
 * deep, so a task on its way to being filed under something cannot also be
 * filed under by something. Reading the live `parentId` rather than the saved
 * task is what makes that hold -- picking a parent and then adding a step would
 * otherwise save the step's own container as a step, and the use case would
 * refuse the second write with nowhere to say so.
 */
function addChild() {
  const held = existing.value
  if (!held || !persist()) return
  router.push(`/tasks/new?parent=${held.id}`)
}
</script>

<template>
  <p class="eyebrow">{{ isEditMode ? 'Editar' : 'Nova' }}</p>
  <h1>{{ isEditMode ? 'Editar Tarefa' : 'Nova Tarefa' }}</h1>

  <p v-if="notFound" class="error">Tarefa nao encontrada.</p>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>

  <form
    v-if="!notFound"
    ref="formEl"
    class="sheet max-w-lg p-4 sm:p-5"
    @submit.prevent="handleSubmit"
  >
    <div class="form-group">
      <label for="title">Titulo</label>
      <input
        id="title"
        ref="titleInput"
        v-model="title"
        type="text"
        required
        autofocus
        autocomplete="off"
      />
    </div>

    <div class="form-group">
      <label for="description">Descricao</label>
      <textarea id="description" v-model="description" rows="3"></textarea>
    </div>

    <!--
      Placed above the three fields it governs, because it decides them: a step
      lives where its container lives, so picking one here settles the category
      and the cadence below rather than contradicting them.
    -->
    <div class="form-group">
      <label for="parent">Tarefa pai</label>
      <select id="parent" v-model="parentId" :disabled="holdsSteps">
        <option value="">Nenhuma</option>
        <option v-for="option in parentOptions" :key="option.id" :value="option.id">
          {{ option.label }}
        </option>
      </select>
      <p v-if="holdsSteps" class="hint">
        Esta tarefa ja tem subtarefas, e uma tarefa com subtarefas nao pode virar subtarefa.
      </p>
      <p v-else-if="parent" class="hint">
        A categoria e a frequencia seguem a tarefa pai. Cada subtarefa conta como uma tarefa; a
        tarefa pai nao conta.
      </p>
    </div>

    <!--
      The other direction, beside the field that says what this belongs to: what
      belongs to IT. Only while editing, since a task with no id yet is nothing
      to file a step under, and only while no parent is selected above -- the
      model is one level deep.
    -->
    <Transition name="reveal">
      <div v-if="isEditMode && existing && !parentId" class="form-group">
        <label for="add-child">Subtarefas</label>
        <p v-if="holdsSteps" class="hint">
          Esta tarefa tem {{ childCount }} {{ childCount === 1 ? 'subtarefa' : 'subtarefas' }}, e e
          concluida por elas.
        </p>
        <p v-else class="hint">
          Divida a tarefa em passos. Cada passo conta como uma tarefa e esta deixa de contar,
          passando a ser so o nome do conjunto.
        </p>
        <button id="add-child" type="button" class="btn btn-secondary" @click="addChild">
          Nova subtarefa
        </button>
      </div>
    </Transition>

    <div class="form-group">
      <label for="category">Categoria</label>
      <select id="category" v-model="categoryId" :disabled="!!parent">
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
      <select id="frequency" v-model="frequency" :disabled="!!parent">
        <option v-for="option in FREQUENCIES" :key="option" :value="option">
          {{ FREQUENCY_LABELS[option] }}
        </option>
      </select>
    </div>

    <!--
      A container is concluded by its steps, so it has no target of its own and
      no turn to be late in. The controls go rather than sit there editing dead
      data -- the same reason Dia da semana only exists while the cadence is
      weekly.
    -->
    <div v-if="!holdsSteps" class="form-group">
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
        <select id="weekday" v-model="weekday" :disabled="!!parent">
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
      <div v-if="frequency === 'daily' && !holdsSteps" class="form-group">
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

    <!--
      Dropped for a task that holds steps, the way Vezes and Turnos are: a
      container counts as nothing on both sides of every ratio already, so a
      flag saying it counts for less has nothing to act on.
    -->
    <div v-if="!holdsSteps" class="form-group">
      <label class="check-row">
        <input v-model="optional" type="checkbox" />
        <span>Opcional</span>
      </label>
      <p class="hint">
        Uma tarefa opcional nao entra na meta do periodo, mas conta quando e concluida -- e nunca
        aparece como atrasada.
      </p>
    </div>

    <!--
      A checkbox, not the registry's power glyph: in a form the field is read
      before it is tapped. Last, because it is a state of the template rather
      than part of its cadence.
    -->
    <div class="form-group">
      <label class="check-row">
        <input v-model="active" type="checkbox" />
        <span>Ativa</span>
      </label>
      <p class="hint">
        Fora da rotina, a tarefa nao aparece em Hoje, mas mantem seu historico e continua na lista
        de tarefas.
      </p>
    </div>

    <div class="flex flex-col-reverse sm:flex-row gap-2 pt-1">
      <RouterLink to="/tasks" class="btn btn-secondary">Cancelar</RouterLink>
      <!--
        Secondary, and only while creating: Salvar is the one primary on the
        form, and this is the same action taking a different way out.
      -->
      <button v-if="!isEditMode" type="button" class="btn btn-secondary" @click="saveAndNew">
        Salvar e criar outra
      </button>
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

/* The global label rule is block + margin; a checkbox sits beside its name. */
.check-row {
  @apply flex items-center gap-2.5 cursor-pointer mb-0;
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
