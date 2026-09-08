import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CreateTaskInput, Task } from '@/entities'
import type { CompletionPeriod } from '@/usecases'
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

  function completionCountFor(task: Task, referenceDate: Date): number {
    return createUseCases().completionCountFor(task, referenceDate)
  }

  function completionHistory(task: Task): CompletionPeriod[] {
    return createUseCases().completionHistory(task)
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

  function setActive(id: string, active: boolean): boolean {
    const result = createUseCases().setActive(id, active)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
      useNotificationStore().success(active ? 'Tarefa ativada.' : 'Tarefa desativada.')
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

  function advanceCompletion(id: string, referenceDate: Date): boolean {
    const result = createUseCases().advanceCompletion(id, referenceDate)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
    } else if (result.error) {
      // A refused check has no visible effect otherwise -- the dial just snaps back.
      useNotificationStore().error(result.error)
    }
    return result.success
  }

  function setCompletionCount(id: string, count: number, referenceDate: Date): boolean {
    const result = createUseCases().setCompletionCount(id, count, referenceDate)
    error.value = result.error ?? null
    if (result.success) {
      loadAll()
    } else if (result.error) {
      useNotificationStore().error(result.error)
    }
    return result.success
  }

  function undoCompletion(id: string, referenceDate: Date): boolean {
    const result = createUseCases().undoCompletion(id, referenceDate)
    error.value = result.error ?? null
    if (result.success) loadAll()
    return result.success
  }

  return {
    tasks,
    error,
    loadAll,
    getById,
    isCompletedFor,
    completionCountFor,
    completionHistory,
    isDueOn,
    isLateOn,
    create,
    update,
    setActive,
    remove,
    advanceCompletion,
    setCompletionCount,
    undoCompletion,
  }
})
