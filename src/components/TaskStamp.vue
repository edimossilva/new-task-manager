<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/entities'
import { FREQUENCY_LABELS } from '@/entities'

/** 2 * pi * 13, the radius the dial is drawn at. */
const CIRCUMFERENCE = 81.7

const props = defineProps<{ task: Task; count: number; periodLabel: string }>()
defineEmits<{ advance: [] }>()

const total = computed(() => props.task.timesPerPeriod)

// Derived from the count rather than taken as a prop: two sources for one fact
// is how a dial ends up drawn full over a row that still reads as pending.
const completed = computed(() => props.count >= total.value)

/** How far the arc has swept. Capped, since a lowered target can leave count > total. */
const dashOffset = computed(() => CIRCUMFERENCE * (1 - Math.min(props.count / total.value, 1)))

const label = computed(() => {
  const base = `${props.task.title} (${FREQUENCY_LABELS[props.task.frequency]}) em ${props.periodLabel}`
  return total.value > 1 ? `${base}, ${props.count} de ${total.value}` : base
})

// 'mixed' is the tri-state a checkbox has for exactly this: some, but not all.
const checkedState = computed(() =>
  completed.value ? 'true' : props.count > 0 ? 'mixed' : 'false',
)
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
    :aria-checked="checkedState"
    :aria-label="label"
    @click="$emit('advance')"
  >
    <span class="ring">
      <svg class="dial" viewBox="0 0 32 32" aria-hidden="true">
        <!-- Track, then the arc that sweeps closed, then the lock mark. -->
        <circle class="track" cx="16" cy="16" r="13" />
        <circle class="sweep" cx="16" cy="16" r="13" :style="{ strokeDashoffset: dashOffset }" />
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
  /* 2*pi*13 ~= 81.7; the offset itself is bound, one check-off at a time. */
  stroke-dasharray: 81.7;
  transition: stroke-dashoffset 340ms cubic-bezier(0.22, 1, 0.36, 1);
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
 * Locked: the arc has just swept closed, the mark draws in behind it, and the
 * whole ring blooms once. Three staggered steps out of one state change.
 */
.lock[aria-checked='true'] .mark {
  animation: draw 260ms 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lock[aria-checked='true'] .ring {
  animation: bloom 620ms 140ms ease-out both;
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
  .sweep {
    transition: none;
  }
  .lock[aria-checked='true'] .mark {
    stroke-dashoffset: 0;
  }
}
</style>
