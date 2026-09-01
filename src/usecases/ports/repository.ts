export interface Repository<T extends { id: string }> {
  getAll(): T[]
  getById(id: string): T | undefined
  create(entity: T): void
  update(entity: T): void
  delete(id: string): void
}
