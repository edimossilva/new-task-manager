import type { Repository } from '@/usecases/ports'

export type StoredRecord = Record<string, unknown>

/**
 * Generic localStorage-backed repository.
 *
 * The whole collection is read into an in-memory Map on `initialize()`, so every
 * read is synchronous and every write updates the cache first and then rewrites
 * the single storage key. Consequence: use-case and store APIs are synchronous
 * and there are no loading states past login.
 *
 * `initialize()` is deliberately synchronous, unlike a network-backed repository
 * would be — localStorage is a synchronous API and pretending otherwise would
 * make the whole bootstrap async for nothing.
 */
export class LocalStorageRepository<T extends { id: string }> implements Repository<T> {
  private cache: Map<string, T> = new Map()
  private initialized = false

  constructor(
    private readonly userId: string,
    private readonly collectionName: string,
    private readonly serialize: (entity: T) => StoredRecord,
    private readonly deserialize: (data: StoredRecord) => T,
  ) {}

  initialize(): void {
    this.cache.clear()
    for (const record of this.readStorage()) {
      const entity = this.deserialize(record)
      this.cache.set(entity.id, entity)
    }
    this.initialized = true
  }

  getAll(): T[] {
    this.assertInitialized()
    return [...this.cache.values()]
  }

  getById(id: string): T | undefined {
    this.assertInitialized()
    return this.cache.get(id)
  }

  create(entity: T): void {
    this.assertInitialized()
    this.cache.set(entity.id, entity)
    this.persist()
  }

  update(entity: T): void {
    this.assertInitialized()
    this.cache.set(entity.id, entity)
    this.persist()
  }

  delete(id: string): void {
    this.assertInitialized()
    this.cache.delete(id)
    this.persist()
  }

  private get storageKey(): string {
    return `new-task-manager:${this.collectionName}:${this.userId}`
  }

  private readStorage(): StoredRecord[] {
    const raw = localStorage.getItem(this.storageKey)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as StoredRecord[]) : []
    } catch (error) {
      // Start empty but leave the key in place: corrupt data is still
      // recoverable by hand from DevTools, and this app has no other backup.
      console.error(`Failed to parse ${this.storageKey} from localStorage:`, error)
      return []
    }
  }

  private persist(): void {
    const records = [...this.cache.values()].map((entity) => this.serialize(entity))
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(records))
    } catch (error) {
      // QuotaExceededError, or a browser blocking site data. The cache already
      // reflects the change, so the UI stays responsive and this stays a
      // background concern rather than an exception through a store action.
      console.error(`Failed to persist ${this.storageKey} to localStorage:`, error)
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.collectionName} repository not initialized. Call initialize() first.`)
    }
  }
}
