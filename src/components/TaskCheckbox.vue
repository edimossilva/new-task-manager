<script setup lang="ts">
import type { Task } from '@/entities'
import { FREQUENCY_LABELS } from '@/entities'

defineProps<{ task: Task; completed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <input
    type="checkbox"
    :checked="completed"
    :aria-label="`Concluir ${task.title} (${FREQUENCY_LABELS[task.frequency]})`"
    @change="emit('toggle')"
  />
</template>
