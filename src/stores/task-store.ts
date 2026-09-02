import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CreateTaskInput, Task } from '@/entities'
import { TaskUseCases } from '@/usecases'
import { getTaskRepository } from '@/adapters/repositories'
import { useNotificationStore } from './notification-store'

function createUseCases() {
  return new TaskUseCases(getTaskRepository())
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const error = ref<string | null>(null)

  function loadAll() {
    tasks.value = createUseCases().getAll()
  }

  function getById(id: string): Task | undefined {
    return createUseCases().getById(id)
  }

  function isCompletedFor(task: Task, referenceDate: Date): boolean {
    return createUseCases().isCompletedFor(task, referenceDate)
  }

  function isDueOn(task: Task, referenceDate: Date): boolean {
    return createUseCases().isDueOn(task, referenceDate)
  }

  function isLateOn(task: Task, referenceDate: Date): boolean {
    return createUseCases().isLateOn(task, referenceDate)
  }

  function create(input: CreateTaskInput): boolean {
    const result = createUseCases().create(input)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
      useNotificationStore().success('Tarefa criada com sucesso.')
    }
    return result.success
  }

  function update(task: Task): boolean {
    const result = createUseCases().update(task)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
      useNotificationStore().success('Tarefa atualizada com sucesso.')
    }
    return result.success
  }

  function remove(id: string): boolean {
    const result = createUseCases().delete(id)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
      useNotificationStore().success('Tarefa excluida com sucesso.')
    }
    return result.success
  }

  function toggleCompletion(id: string, referenceDate: Date): boolean {
    const result = createUseCases().toggleCompletion(id, referenceDate)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
    } else if (result.error) {
      // A refused toggle has no visible effect otherwise -- the box just snaps back.
      useNotificationStore().error(result.error)
    }
    return result.success
  }

  return {
    tasks,
    error,
    loadAll,
    getById,
    isCompletedFor,
    isDueOn,
    isLateOn,
    create,
    update,
    remove,
    toggleCompletion,
  }
})
