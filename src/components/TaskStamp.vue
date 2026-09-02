<script setup lang="ts">
import type { Task } from '@/entities'
import { FREQUENCY_LABELS } from '@/entities'

defineProps<{ task: Task; completed: boolean; periodLabel: string }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <!--
    A button with role="checkbox" rather than a real <input>: the browser never
    flips any intrinsic state, so a toggle the use case refuses cannot leave the
    control visually out of sync with the store.
  -->
  <button
    type="button"
    role="checkbox"
    class="lock"
    :aria-checked="completed"
    :aria-label="`${task.title} (${FREQUENCY_LABELS[task.frequency]}) em ${periodLabel}`"
    @click="$emit('toggle')"
  >
    <span class="ring">
      <svg class="dial" viewBox="0 0 32 32" aria-hidden="true">
        <!-- Track, then the arc that sweeps closed, then the lock mark. -->
        <circle class="track" cx="16" cy="16" r="13" />
        <circle class="sweep" cx="16" cy="16" r="13" />
        <path class="mark" d="M9.5 16.5 L14 21 L22.5 11.5" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
@reference "../assets/main.css";

/* 44px hit area around a 30px dial: thumb-sized without looking oversized. */
.lock {
  @apply flex items-center justify-center w-11 h-11 shrink-0 -m-2 bg-transparent
         border-none cursor-pointer;
  -webkit-tap-highlight-color: transparent;
}

.ring {
  @apply relative flex items-center justify-center w-[30px] h-[30px] rounded-full
         transition-[background,box-shadow] duration-[200ms];
}

.lock:hover .ring {
  background: var(--color-accent-dim);
}

.lock:active .ring {
  @apply scale-90;
}

.lock:focus-visible {
  @apply outline-none;
}
.lock:focus-visible .ring {
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

.dial {
  @apply w-[30px] h-[30px] -rotate-90;
}

.track {
  fill: none;
  stroke: var(--color-line-strong);
  stroke-width: 2;
}

.sweep {
  fill: none;
  stroke: var(--color-done);
  stroke-width: 2.5;
  stroke-linecap: round;
  /* 2*pi*13 ~= 81.7 */
  stroke-dasharray: 81.7;
  stroke-dashoffset: 81.7;
}

.mark {
  fill: none;
  stroke: var(--color-done);
  stroke-width: 2.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 22;
  stroke-dashoffset: 22;
  transform-origin: center;
  transform: rotate(90deg);
}

/*
 * Locked: the arc sweeps closed, the mark draws in behind it, and the whole
 * ring blooms once. Three staggered steps out of one state change.
 */
.lock[aria-checked='true'] .sweep {
  animation: sweep 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lock[aria-checked='true'] .mark {
  animation: draw 260ms 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lock[aria-checked='true'] .ring {
  animation: bloom 620ms 140ms ease-out both;
}

@keyframes sweep {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes bloom {
  0% {
    box-shadow: 0 0 0 0 var(--color-done-dim);
  }
  40% {
    box-shadow: 0 0 14px 3px var(--color-done-dim);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* With motion reduced the state still has to be unmistakable, not animated. */
@media (prefers-reduced-motion: reduce) {
  .lock[aria-checked='true'] .sweep,
  .lock[aria-checked='true'] .mark {
    stroke-dashoffset: 0;
  }
}
</style>
