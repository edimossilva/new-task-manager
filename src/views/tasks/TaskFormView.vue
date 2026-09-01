<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Task, TaskFrequency } from '@/entities'
import { FREQUENCIES, FREQUENCY_LABELS } from '@/entities'
import { useTaskStore } from '@/stores/task-store'
import { useEntityForm } from '@/composables/use-entity-form'

const store = useTaskStore()
const router = useRouter()

const { isEditMode, existing } = useEntityForm<Task>((id) => store.getById(id))

const title = ref('')
const description = ref('')
const frequency = ref<TaskFrequency>('daily')

watch(existing, (task) => {
  if (!task) return
  title.value = task.title
  description.value = task.description ?? ''
  frequency.value = task.frequency
})

function handleSubmit() {
  const input = {
    title: title.value,
    description: description.value.trim() || undefined,
    frequency: frequency.value,
  }

  const saved = existing.value ? store.update({ ...existing.value, ...input }) : store.create(input)

  if (saved) router.push('/tasks')
}
</script>

<template>
  <h1>{{ isEditMode ? 'Editar Tarefa' : 'Nova Tarefa' }}</h1>

  <p v-if="store.error" class="error">{{ store.error }}</p>

  <form class="max-w-lg" @submit.prevent="handleSubmit">
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

    <div class="flex gap-2">
      <button type="submit" class="btn">Salvar</button>
      <RouterLink to="/tasks" class="btn btn-secondary">Cancelar</RouterLink>
    </div>
  </form>
</template>
