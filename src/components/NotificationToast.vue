<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification-store'

const store = useNotificationStore()
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="notification in store.notifications"
          :key="notification.id"
          class="pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm cursor-pointer"
          :class="{
            'bg-emerald-600 text-white': notification.type === 'success',
            'bg-red-600 text-white': notification.type === 'error',
          }"
          @click="store.dismiss(notification.id)"
        >
          {{ notification.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toast-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(1rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}
</style>
