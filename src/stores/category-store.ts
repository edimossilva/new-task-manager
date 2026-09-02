import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Category, CreateCategoryInput } from '@/entities'
import { CategoryUseCases } from '@/usecases'
import { getCategoryRepository, getTaskRepository } from '@/adapters/repositories'
import { useNotificationStore } from './notification-store'

function createUseCases() {
  return new CategoryUseCases(getCategoryRepository(), getTaskRepository())
}

export const useCategoryStore = defineStore('category', () => {
  const categories = ref<Category[]>([])
  const error = ref<string | null>(null)

  /** Name lookup for the badges, so lists do not scan the array per row. */
  const byId = computed(() => new Map(categories.value.map((category) => [category.id, category])))

  function loadAll() {
    categories.value = createUseCases().getAll()
  }

  function getById(id: string): Category | undefined {
    return createUseCases().getById(id)
  }

  function countTasks(id: string): number {
    return createUseCases().countTasks(id)
  }

  function create(input: CreateCategoryInput): boolean {
    const result = createUseCases().create(input)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
      useNotificationStore().success('Categoria criada com sucesso.')
    }
    return result.success
  }

  function update(category: Category): boolean {
    const result = createUseCases().update(category)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
      useNotificationStore().success('Categoria atualizada com sucesso.')
    }
    return result.success
  }

  function remove(id: string): boolean {
    const result = createUseCases().delete(id)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
      useNotificationStore().success('Categoria excluida com sucesso.')
    } else if (result.error) {
      // The guard is the whole point of the action, so it must be visible.
      useNotificationStore().error(result.error)
    }
    return result.success
  }

  return { categories, error, byId, loadAll, getById, countTasks, create, update, remove }
})
