<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Category, CategoryInk } from '@/entities'
import { CATEGORY_INKS, CATEGORY_INK_LABELS, DEFAULT_CATEGORY_INK } from '@/entities'
import { useCategoryStore } from '@/stores/category-store'
import { useEntityForm } from '@/composables/use-entity-form'

const store = useCategoryStore()
const router = useRouter()

const { isEditMode, existing } = useEntityForm<Category>((id) => store.getById(id))

// Reaching /categories/:id/edit with an unknown id would otherwise fall through
// to create() on submit and silently make a second category.
const notFound = computed(() => isEditMode.value && existing.value === undefined)

const name = ref('')
const description = ref('')
const ink = ref<CategoryInk>(DEFAULT_CATEGORY_INK)

watch(existing, (category) => {
  if (!category) return
  name.value = category.name
  description.value = category.description ?? ''
  ink.value = category.ink
})

function handleSubmit() {
  if (notFound.value) return

  const input = {
    name: name.value,
    description: description.value.trim() || undefined,
    ink: ink.value,
  }

  const saved = existing.value ? store.update({ ...existing.value, ...input }) : store.create(input)

  if (saved) router.push('/categories')
}
</script>

<template>
  <p class="eyebrow">{{ isEditMode ? 'Editar' : 'Nova' }}</p>
  <h1>{{ isEditMode ? 'Editar Categoria' : 'Nova Categoria' }}</h1>

  <p v-if="notFound" class="error">Categoria nao encontrada.</p>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>

  <form v-if="!notFound" class="sheet max-w-lg p-4 sm:p-5" @submit.prevent="handleSubmit">
    <div class="form-group">
      <label for="name">Nome</label>
      <input id="name" v-model="name" type="text" required autofocus autocomplete="off" />
    </div>

    <div class="form-group">
      <label for="description">Descricao</label>
      <textarea id="description" v-model="description" rows="2"></textarea>
    </div>

    <div class="form-group">
      <span class="swatch-label">Cor</span>
      <!-- Radios, not a colour picker: the palette is fixed, so the choice is
           one of eight rather than sixteen million. -->
      <div class="swatches" role="radiogroup" aria-label="Cor">
        <label v-for="option in CATEGORY_INKS" :key="option" class="swatch">
          <input v-model="ink" type="radio" name="ink" :value="option" class="sr-only" />
          <span
            class="swatch-chip"
            :class="[`ink-${option}`, { 'is-on': ink === option }]"
            :title="CATEGORY_INK_LABELS[option]"
          ></span>
          <span class="sr-only">{{ CATEGORY_INK_LABELS[option] }}</span>
        </label>
      </div>
    </div>

    <div class="flex flex-col-reverse sm:flex-row gap-2 pt-1">
      <RouterLink to="/categories" class="btn btn-secondary">Cancelar</RouterLink>
      <button type="submit" class="btn">Salvar</button>
    </div>
  </form>
  <RouterLink v-else to="/categories" class="btn btn-secondary">Voltar</RouterLink>
</template>

<style scoped>
@reference "../../assets/main.css";

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-flare-deep mb-1;
}

.swatch-label {
  @apply block font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]
         text-ink-soft mb-1.5;
}

.swatches {
  @apply flex flex-wrap gap-2;
}

/* 44px tap area around a 28px chip. */
.swatch {
  @apply flex items-center justify-center w-11 h-11 cursor-pointer;
}

.swatch-chip {
  @apply block w-7 h-7 rounded-full border-2 border-ink transition-transform duration-[120ms];
  background: var(--cat);
}

.swatch:hover .swatch-chip {
  @apply scale-110;
}

/* Selected reads as a printed target: ring, gap, chip. */
.swatch-chip.is-on {
  box-shadow:
    0 0 0 2px var(--color-paper-raised),
    0 0 0 4px var(--color-ink);
}

.swatch input:focus-visible + .swatch-chip {
  box-shadow:
    0 0 0 2px var(--color-paper-raised),
    0 0 0 4px var(--color-flare);
}

.ink-flare {
  --cat: var(--color-cat-flare);
}
.ink-ultra {
  --cat: var(--color-cat-ultra);
}
.ink-moss {
  --cat: var(--color-cat-moss);
}
.ink-ochre {
  --cat: var(--color-cat-ochre);
}
.ink-plum {
  --cat: var(--color-cat-plum);
}
.ink-clay {
  --cat: var(--color-cat-clay);
}
.ink-teal {
  --cat: var(--color-cat-teal);
}
.ink-ink {
  --cat: var(--color-cat-ink);
}
</style>
