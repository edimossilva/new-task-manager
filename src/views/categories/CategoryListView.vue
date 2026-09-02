<script setup lang="ts">
import { onMounted, ref, toRef } from 'vue'
import { useCategoryStore } from '@/stores/category-store'
import { useTaskStore } from '@/stores/task-store'
import { useSortable } from '@/composables/use-sortable'
import CategoryBadge from '@/components/CategoryBadge.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const store = useCategoryStore()
const taskStore = useTaskStore()

const confirmDialog = ref<InstanceType<typeof ConfirmDialog>>()
const pendingDeleteId = ref<string>()

const { sortedItems, sortBy, sortClass } = useSortable(toRef(store, 'categories'), {
  name: (category) => category.name.toLowerCase(),
  tasks: (category) => store.countTasks(category.id),
})

onMounted(() => {
  // Tasks too: the count column and the delete guard both read them.
  taskStore.loadAll()
  store.loadAll()
})

function confirmDelete(id: string) {
  pendingDeleteId.value = id
  confirmDialog.value?.open()
}

function handleDelete() {
  if (pendingDeleteId.value) store.remove(pendingDeleteId.value)
}
</script>

<template>
  <header class="flex items-start justify-between gap-3 mb-5">
    <h1 class="!mb-0">Categorias</h1>
    <RouterLink to="/categories/new" class="btn shrink-0">Nova</RouterLink>
  </header>

  <p v-if="store.error" class="error">{{ store.error }}</p>

  <ul v-if="sortedItems.length" class="md:hidden">
    <li v-for="category in sortedItems" :key="category.id" class="card">
      <div class="min-w-0 flex-1">
        <CategoryBadge :category="category" />
        <p v-if="category.description" class="card-desc">{{ category.description }}</p>
        <p class="card-meta figure">
          {{ store.countTasks(category.id) }}
          {{ store.countTasks(category.id) === 1 ? 'tarefa' : 'tarefas' }}
        </p>
      </div>
      <div class="flex flex-col items-end shrink-0 -my-1">
        <RouterLink :to="`/categories/${category.id}/edit`" class="btn-link">Editar</RouterLink>
        <button type="button" class="btn-link danger" @click="confirmDelete(category.id)">
          Excluir
        </button>
      </div>
    </li>
  </ul>

  <div v-if="sortedItems.length" class="hidden md:block overflow-x-auto">
    <table>
      <thead>
        <tr>
          <th :class="sortClass('name')" @click="sortBy('name')">Nome</th>
          <th>Descricao</th>
          <th :class="sortClass('tasks')" @click="sortBy('tasks')">Tarefas</th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="category in sortedItems" :key="category.id">
          <td><CategoryBadge :category="category" /></td>
          <td class="text-ink-faint">{{ category.description || '-' }}</td>
          <td class="figure">{{ store.countTasks(category.id) }}</td>
          <td>
            <div class="actions">
              <RouterLink :to="`/categories/${category.id}/edit`" class="btn-link">
                Editar
              </RouterLink>
              <button type="button" class="btn-link danger" @click="confirmDelete(category.id)">
                Excluir
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-else class="empty">
    <p>
      Nenhuma categoria cadastrada.
      <RouterLink to="/categories/new">Crie a primeira</RouterLink>
      para agrupar suas tarefas.
    </p>
  </div>

  <ConfirmDialog ref="confirmDialog" @confirm="handleDelete">
    Excluir esta categoria?
  </ConfirmDialog>
</template>

<style scoped>
@reference "../../assets/main.css";

.card {
  @apply flex items-start gap-3 px-3.5 py-3 mb-2 bg-paper-raised
         border border-rule-strong rounded-sm;
}

.card-desc {
  @apply mt-1 text-[0.8125rem] leading-snug text-ink-faint break-words;
}

.card-meta {
  @apply mt-1 text-[0.6875rem] text-ink-faint;
}

.empty {
  @apply mt-6 px-4 py-8 text-center bg-paper-raised border border-dashed border-rule-strong
         rounded-sm;
}
</style>
