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
    class="stamp"
    :aria-checked="completed"
    :aria-label="`${task.title} (${FREQUENCY_LABELS[task.frequency]}) em ${periodLabel}`"
    @click="$emit('toggle')"
  >
    <span class="stamp-box">
      <svg class="stamp-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12.5 L9.5 18 L20 6.5" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
@reference "../assets/main.css";

/* 44px hit area around a 26px mark: thumb-sized without looking oversized. */
.stamp {
  @apply flex items-center justify-center w-11 h-11 shrink-0 -m-2.5 bg-transparent
         border-none cursor-pointer;
  -webkit-tap-highlight-color: transparent;
}

.stamp-box {
  @apply relative flex items-center justify-center w-[26px] h-[26px]
         border-2 border-ink rounded-[2px] bg-paper-raised
         transition-[background-color,border-color,transform] duration-[140ms];
}

.stamp:hover .stamp-box {
  @apply bg-accent-dim;
}

.stamp:active .stamp-box {
  @apply scale-90;
}

.stamp:focus-visible {
  @apply outline-none;
}
.stamp:focus-visible .stamp-box {
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

.stamp-mark {
  @apply w-[18px] h-[18px];
  fill: none;
  stroke: var(--color-paper);
  stroke-width: 3.4;
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-dasharray: 32;
  stroke-dashoffset: 32;
}

/* Struck: the box inks over and the mark presses in, off-square like a stamp. */
.stamp[aria-checked='true'] .stamp-box {
  @apply bg-moss border-moss;
  animation: press 260ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.stamp[aria-checked='true'] .stamp-mark {
  animation: ink 220ms 60ms ease-out both;
}

@keyframes press {
  0% {
    transform: scale(0.72) rotate(-9deg);
  }
  60% {
    transform: scale(1.08) rotate(-4deg);
  }
  100% {
    transform: scale(1) rotate(-3deg);
  }
}

@keyframes ink {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
