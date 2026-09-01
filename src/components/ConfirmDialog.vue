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
    <p><slot>Tem certeza que deseja excluir?</slot></p>
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" @click="close">Cancelar</button>
      <button type="button" class="btn btn-danger" @click="handleConfirm">Excluir</button>
    </div>
  </dialog>
</template>
