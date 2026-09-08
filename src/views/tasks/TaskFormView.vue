<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Task, TaskFrequency, Weekday } from '@/entities'
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  MAX_TIMES_PER_PERIOD,
  TIMES_PER_PERIOD_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
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

onMounted(() => categoryStore.loadAll())

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
    categoryId: categoryId.value || undefined,
    timesPerPeriod: timesPerPeriod.value === '' ? NaN : timesPerPeriod.value,
  }

  const saved = existing.value ? store.update({ ...existing.value, ...input }) : store.create(input)

  if (!saved) return

  // The task list hides tasks whose weekday has not come up yet, so a freshly
  // created one can be absent from the page we are about to land on.
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

    <div class="flex flex-col-reverse sm:flex-row gap-2 pt-1">
      <RouterLink to="/tasks" class="btn btn-secondary">Cancelar</RouterLink>
      <button type="submit" class="btn">Salvar</button>
    </div>
  </form>
  <RouterLink v-else to="/tasks" class="btn btn-secondary">Voltar</RouterLink>
</template>

<style scoped>
@reference "../../assets/main.css";

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
