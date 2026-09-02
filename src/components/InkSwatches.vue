<script setup lang="ts">
import { useId } from 'vue'
import type { InkName } from '@/entities'
import { INKS } from '@/entities'

const props = defineProps<{ modelValue: InkName; choices: InkName[]; name?: string }>()
defineEmits<{ 'update:modelValue': [InkName] }>()

// Radios need a shared name; two grids on one page must not fight.
const group = props.name ?? useId()
</script>

<template>
  <div class="swatches" role="radiogroup">
    <label v-for="option in choices" :key="option" class="swatch">
      <input
        type="radio"
        :name="group"
        :value="option"
        :checked="modelValue === option"
        class="sr-only"
        @change="$emit('update:modelValue', option)"
      />
      <span
        class="chip"
        :class="{ 'is-on': modelValue === option }"
        :style="{ '--cat-base': INKS[option].base, '--cat-deep': INKS[option].deep }"
        :title="INKS[option].label"
      ></span>
      <span class="sr-only">{{ INKS[option].label }}</span>
    </label>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

/*
 * An ink chart: fixed columns so twenty swatches read as a printed grid rather
 * than a ragged wrap. Five across on a phone, ten on anything wider.
 */
.swatches {
  @apply grid grid-cols-5 gap-1 sm:grid-cols-10 justify-items-center;
}

/* 44px tap area around a 26px chip. */
.swatch {
  @apply flex items-center justify-center w-11 h-11 cursor-pointer;
  -webkit-tap-highlight-color: transparent;
}

.chip {
  @apply block w-[26px] h-[26px] rounded-full border-2 transition-transform duration-[120ms];
  background: var(--cat-base);
  border-color: var(--cat-deep);
}

.swatch:hover .chip {
  @apply scale-110;
}

/* Selected reads as a printed registration target: chip, gap, ink ring. */
.chip.is-on {
  @apply scale-105;
  box-shadow:
    0 0 0 2px var(--color-panel),
    0 0 0 4px var(--color-fg);
}

.swatch input:focus-visible + .chip {
  box-shadow:
    0 0 0 2px var(--color-panel),
    0 0 0 4px var(--color-accent);
}
</style>
