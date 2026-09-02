<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification-store'

const store = useNotificationStore()
</script>

<template>
  <Teleport to="body">
    <!--
      Above the thumb on a phone (clear of the bottom nav), top-right on a
      desktop where there is no bar to avoid.
    -->
    <div class="toast-layer">
      <TransitionGroup name="toast">
        <button
          v-for="notification in store.notifications"
          :key="notification.id"
          type="button"
          class="toast"
          :class="notification.type"
          @click="store.dismiss(notification.id)"
        >
          {{ notification.message }}
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
@reference "../assets/main.css";

.toast-layer {
  @apply fixed z-[9999] flex flex-col-reverse gap-2 pointer-events-none
         left-4 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]
         sm:left-auto sm:right-5 sm:bottom-auto sm:top-5 sm:flex-col sm:max-w-sm;
}

.toast {
  @apply pointer-events-auto w-full px-4 py-3 text-left font-sans text-sm font-medium
         border-2 rounded-sm cursor-pointer;
  box-shadow: var(--panel-shadow);
}

.toast.success {
  @apply bg-panel text-fg border-fg;
}

.toast.error {
  @apply bg-alarm text-void border-fg;
}

.toast-enter-active,
.toast-leave-active,
.toast-move {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(0.75rem) rotate(-1.5deg);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(0.5rem) scale(0.96);
}

@media (min-width: 640px) {
  .toast-enter-from {
    transform: translateX(1rem) rotate(1.5deg);
  }
}
</style>
