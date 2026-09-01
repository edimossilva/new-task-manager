import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  type Firestore,
  type DocumentData,
} from 'firebase/firestore'
import type { Repository } from '@/usecases/ports'

export class FirestoreRepository<T extends { id: string }> implements Repository<T> {
  private readonly db: Firestore
  private readonly userId: string
  private readonly collectionName: string
  private readonly serialize: (entity: T) => DocumentData
  private readonly deserialize: (data: DocumentData) => T
  private cache: Map<string, T> = new Map()
  private initialized = false

  constructor(
    db: Firestore,
    userId: string,
    collectionName: string,
    serialize: (entity: T) => DocumentData,
    deserialize: (data: DocumentData) => T,
  ) {
    this.db = db
    this.userId = userId
    this.collectionName = collectionName
    this.serialize = serialize
    this.deserialize = deserialize
  }

  async initialize(): Promise<void> {
    const snapshot = await getDocs(this.getCollectionRef())
    this.cache.clear()
    for (const docSnap of snapshot.docs) {
      const entity = this.deserialize(docSnap.data())
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
    this.persistToFirestore(entity)
  }

  update(entity: T): void {
    this.assertInitialized()
    this.cache.set(entity.id, entity)
    this.persistToFirestore(entity)
  }

  delete(id: string): void {
    this.assertInitialized()
    this.cache.delete(id)
    const docRef = doc(this.db, 'users', this.userId, this.collectionName, id)
    deleteDoc(docRef).catch((error) => {
      console.error(`Failed to delete ${this.collectionName}/${id} from Firestore:`, error)
    })
  }

  private getCollectionRef() {
    return collection(this.db, 'users', this.userId, this.collectionName)
  }

  private persistToFirestore(entity: T): void {
    const docRef = doc(this.db, 'users', this.userId, this.collectionName, entity.id)
    setDoc(docRef, this.serialize(entity)).catch((error) => {
      console.error(`Failed to persist ${this.collectionName}/${entity.id} to Firestore:`, error)
    })
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        `FirestoreRepository(${this.collectionName}) not initialized. Call initialize() first.`,
      )
    }
  }
}
