<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ACCENT_CHOICES } from '@/entities'
import { useAppearanceStore } from '@/stores/appearance-store'
import InkSwatches from '@/components/InkSwatches.vue'

const store = useAppearanceStore()
const open = ref(false)
const rootRef = ref<HTMLElement>()

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  if (rootRef.value?.contains(event.target as Node)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="trigger"
      :aria-expanded="open"
      :title="`Cor do app: ${store.ink.label}`"
      aria-label="Escolher a cor do app"
      @click="open = !open"
    >
      <span class="trigger-chip" :style="{ background: store.ink.base }"></span>
    </button>

    <Transition name="pop">
      <div v-if="open" class="panel">
        <p class="panel-title">Cor do app</p>
        <InkSwatches
          :model-value="store.accent"
          :choices="ACCENT_CHOICES"
          name="accent"
          @update:model-value="store.setAccent"
        />
        <p class="panel-note">{{ store.ink.label }}</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.trigger {
  @apply flex items-center justify-center w-9 h-9 bg-transparent border border-rule-strong
         rounded-sm cursor-pointer transition-colors duration-[120ms];
}
.trigger:hover {
  @apply border-ink;
}

.trigger-chip {
  @apply block w-4 h-4 rounded-full border border-ink;
}

/*
 * Right-anchored so it never runs off the screen edge on a phone, and width
 * capped to the viewport rather than a fixed value.
 */
.panel {
  @apply absolute right-0 top-full mt-2 z-50 p-3 w-[min(21rem,calc(100vw-2rem))]
         bg-paper-raised border-2 border-ink rounded-sm;
  box-shadow: var(--shadow-stamp);
}

.panel-title {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.12em] text-ink-soft mb-2;
}

.panel-note {
  @apply mt-2 pt-2 border-t border-rule font-mono text-[0.625rem] uppercase
         tracking-[0.12em] text-accent-deep;
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 140ms ease,
    transform 180ms cubic-bezier(0.34, 1.4, 0.64, 1);
  transform-origin: top right;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(-0.25rem);
}
</style>
