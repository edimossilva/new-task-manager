<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Task, TaskFrequency, Weekday } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS, WEEKDAYS, WEEKDAY_LABELS } from '@/entities'
import { useNotificationStore } from '@/stores/notification-store'
import { useTaskStore } from '@/stores/task-store'
import { useEntityForm } from '@/composables/use-entity-form'

const store = useTaskStore()
const notifications = useNotificationStore()
const router = useRouter()

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

watch(existing, (task) => {
  if (!task) return
  title.value = task.title
  description.value = task.description ?? ''
  frequency.value = task.frequency
  weekday.value = task.weekday ?? ''
})

function handleSubmit() {
  if (notFound.value) return

  const chosenWeekday =
    frequency.value === 'weekly' && weekday.value !== '' ? weekday.value : undefined

  const input = {
    title: title.value,
    description: description.value.trim() || undefined,
    frequency: frequency.value,
    // Always present, never omitted: the spread below would otherwise preserve
    // the previous weekday instead of clearing it.
    weekday: chosenWeekday,
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
  <h1>{{ isEditMode ? 'Editar Tarefa' : 'Nova Tarefa' }}</h1>

  <p v-if="notFound" class="error">Tarefa nao encontrada.</p>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>

  <form v-if="!notFound" class="max-w-lg" @submit.prevent="handleSubmit">
    <div class="form-group">
      <label for="title">Titulo</label>
      <input id="title" v-model="title" type="text" required autofocus />
    </div>

    <div class="form-group">
      <label for="description">Descricao</label>
      <textarea id="description" v-model="description" rows="3"></textarea>
    </div>

    <div class="form-group">
      <label for="frequency">Frequencia</label>
      <select id="frequency" v-model="frequency">
        <option v-for="option in FREQUENCIES" :key="option" :value="option">
          {{ FREQUENCY_LABELS[option] }}
        </option>
      </select>
    </div>

    <div v-if="frequency === 'weekly'" class="form-group">
      <label for="weekday">Dia da semana</label>
      <select id="weekday" v-model="weekday">
        <option value="">Qualquer dia</option>
        <option v-for="option in WEEKDAYS" :key="option" :value="option">
          {{ WEEKDAY_LABELS[option] }}
        </option>
      </select>
      <p class="mt-1.5 text-[0.8125rem] text-text-muted">
        A tarefa aparece a partir deste dia e vale para a semana inteira.
      </p>
    </div>

    <div class="flex gap-2">
      <button type="submit" class="btn">Salvar</button>
      <RouterLink to="/tasks" class="btn btn-secondary">Cancelar</RouterLink>
    </div>
  </form>
  <RouterLink v-else to="/tasks" class="btn btn-secondary">Voltar</RouterLink>
</template>
