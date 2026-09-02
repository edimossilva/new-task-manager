<script setup lang="ts">
import { ref } from 'vue'

const dialogRef = ref<HTMLDialogElement>()
const emit = defineEmits<{ confirm: [] }>()

function open() {
  dialogRef.value?.showModal()
}

function close() {
  dialogRef.value?.close()
}

function handleConfirm() {
  emit('confirm')
  close()
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialogRef">
    <p class="dialog-title"><slot>Tem certeza que deseja excluir?</slot></p>
    <p class="text-[0.8125rem] text-fg-faint">Esta acao nao pode ser desfeita.</p>
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" @click="close">Cancelar</button>
      <button type="button" class="btn btn-danger" @click="handleConfirm">Excluir</button>
    </div>
  </dialog>
</template>

<style scoped>
@reference "../assets/main.css";

.dialog-title {
  @apply font-display text-[1.15rem] leading-snug font-semibold text-fg mb-1;
}
</style>
