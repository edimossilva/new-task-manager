import type { Category, CreateCategoryInput } from '@/entities'
import { createCategory } from '@/entities'
import type { CategoryRepository, TaskRepository } from './ports'
import type { UseCaseResult } from './task-usecases'
import { validateRequiredText } from './validation'

export class CategoryUseCases {
  constructor(
    private categoryRepo: CategoryRepository,
    private taskRepo: TaskRepository,
  ) {}

  getAll(): Category[] {
    return this.categoryRepo.getAll()
  }

  getById(id: string): Category | undefined {
    return this.categoryRepo.getById(id)
  }

  /** How many tasks reference this category. Drives the list column. */
  countTasks(id: string): number {
    return this.taskRepo.getByCategoryId(id).length
  }

  create(input: CreateCategoryInput): UseCaseResult {
    const error = validateRequiredText(input.name, 'Nome')
    if (error) return { success: false, error }

    this.categoryRepo.create(createCategory({ ...input, name: input.name.trim() }))
    return { success: true }
  }

  update(category: Category): UseCaseResult {
    const error = validateRequiredText(category.name, 'Nome')
    if (error) return { success: false, error }

    this.categoryRepo.update({
      ...category,
      name: category.name.trim(),
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Deleting a category in use would leave every task pointing at nothing, so
   * it is blocked while tasks reference it -- the same guard the reference app
   * puts on owners and payment categories.
   */
  delete(id: string): UseCaseResult {
    if (!this.categoryRepo.getById(id)) {
      return { success: false, error: 'Categoria nao encontrada.' }
    }

    const linked = this.taskRepo.getByCategoryId(id)
    if (linked.length > 0) {
      return {
        success: false,
        error: 'Nao e possivel excluir a categoria pois existem tarefas vinculadas.',
      }
    }

    this.categoryRepo.delete(id)
    return { success: true }
  }
}
