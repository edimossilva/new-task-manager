<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ACCENT_CHOICES, THEMES, THEME_NAMES } from '@/entities'
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
      :title="`${store.themeInfo.label} / ${store.ink.label}`"
      aria-label="Aparencia"
      @click="open = !open"
    >
      <span class="trigger-dial" :style="{ '--a': store.ink.base }"></span>
    </button>

    <Transition name="pop">
      <div v-if="open" class="panel">
        <p class="panel-title">Tema</p>
        <ul class="themes">
          <li v-for="name in THEME_NAMES" :key="name">
            <button
              type="button"
              class="theme"
              :class="{ 'is-on': store.theme === name }"
              :aria-pressed="store.theme === name"
              @click="store.setTheme(name)"
            >
              <!-- Ground and foreground, so the tile previews the real thing. -->
              <span
                class="theme-tile"
                :style="{
                  '--g': THEMES[name].swatch[0],
                  '--f': THEMES[name].swatch[1],
                }"
              >
                <span class="theme-bar"></span>
                <span class="theme-bar short"></span>
              </span>
              <span class="theme-name">{{ THEMES[name].label }}</span>
            </button>
          </li>
        </ul>
        <p class="panel-note">{{ store.themeInfo.note }}</p>

        <p class="panel-title mt-4">Cor de destaque</p>
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
  @apply flex items-center justify-center w-9 h-9 bg-transparent border border-line-strong
         cursor-pointer transition-colors duration-[140ms];
  border-radius: var(--radius-sm);
}
.trigger:hover {
  @apply border-accent-text;
}

/* A lit dial: accent core with a bloom, so the trigger reads as an indicator. */
.trigger-dial {
  @apply block w-3.5 h-3.5 rounded-full;
  background: var(--a);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--a) 28%, transparent),
    0 0 10px var(--a);
}

.panel {
  @apply absolute right-0 top-full mt-2 z-50 p-3.5 w-[min(22rem,calc(100vw-1.5rem))]
         bg-panel border border-line-strong;
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
  backdrop-filter: var(--panel-blur);
}

.panel-title {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em] text-fg-faint mb-2;
}

.panel-note {
  @apply mt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-accent-text;
}

.themes {
  @apply grid grid-cols-5 gap-1.5;
}

.theme {
  @apply w-full flex flex-col items-center gap-1 p-1 bg-transparent border border-transparent
         cursor-pointer transition-colors duration-[140ms];
  border-radius: var(--radius-sm);
}
.theme:hover {
  @apply border-line-strong;
}
.theme.is-on {
  border-color: var(--color-accent);
}

/* Each tile is a miniature of the panel it selects. */
.theme-tile {
  @apply relative flex flex-col justify-center gap-[3px] w-full aspect-square px-1.5
         overflow-hidden border border-line;
  background: var(--g);
  border-radius: calc(var(--radius-sm) + 1px);
}

.theme-bar {
  @apply block h-[3px] w-full;
  background: var(--f);
  opacity: 0.9;
}
.theme-bar.short {
  @apply w-1/2;
  opacity: 0.5;
}

.theme-name {
  @apply font-mono text-[0.5rem] font-medium uppercase tracking-[0.06em] text-fg-faint
         text-center leading-tight;
}
.theme.is-on .theme-name {
  @apply text-fg;
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
