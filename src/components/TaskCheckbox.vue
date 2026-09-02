<script setup lang="ts">
import { nextTick } from 'vue'
import type { Task } from '@/entities'
import { FREQUENCY_LABELS } from '@/entities'

const props = defineProps<{ task: Task; completed: boolean; periodLabel: string }>()
const emit = defineEmits<{ toggle: [] }>()

async function handleChange(event: Event) {
  emit('toggle')

  // `change` is not preventable, so the browser has already flipped the DOM
  // property. If the toggle was refused the bound `completed` never changes,
  // Vue patches nothing, and the box would sit visibly out of sync with state.
  await nextTick()
  const input = event.target as HTMLInputElement
  input.checked = props.completed
}
</script>

<template>
  <input
    type="checkbox"
    :checked="completed"
    :aria-label="`Concluir ${task.title} (${FREQUENCY_LABELS[task.frequency]}) em ${periodLabel}`"
    @change="handleChange"
  />
</template>
