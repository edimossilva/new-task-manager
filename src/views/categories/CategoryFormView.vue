<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Category, CategoryInk } from '@/entities'
import { CATEGORY_INKS, DEFAULT_CATEGORY_INK } from '@/entities'
import { useCategoryStore } from '@/stores/category-store'
import { useEntityForm } from '@/composables/use-entity-form'
import InkSwatches from '@/components/InkSwatches.vue'

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
      <InkSwatches v-model="ink" :choices="CATEGORY_INKS" name="category-ink" />
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
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-accent-deep mb-1;
}

.swatch-label {
  @apply block font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]
         text-ink-soft mb-1.5;
}
</style>
