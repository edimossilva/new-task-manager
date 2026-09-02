import { Timestamp, type DocumentData, type Firestore } from 'firebase/firestore'
import type { Category, CategoryInk } from '@/entities'
import { DEFAULT_CATEGORY_INK, isCategoryInk } from '@/entities'
import type { CategoryRepository } from '@/usecases/ports'
import { FirestoreRepository } from './firestore-repository'

function serialize(category: Category): DocumentData {
  return {
    id: category.id,
    name: category.name,
    description: category.description ?? null,
    ink: category.ink,
    createdAt: Timestamp.fromDate(category.createdAt),
    updatedAt: Timestamp.fromDate(category.updatedAt),
  }
}

/** An unknown ink falls back rather than rendering an unstyled chip. */
function toInk(value: unknown): CategoryInk {
  return isCategoryInk(value) ? value : DEFAULT_CATEGORY_INK
}

function deserialize(data: DocumentData): Category {
  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string | null) ?? undefined,
    ink: toInk(data.ink),
    createdAt: (data.createdAt as Timestamp).toDate(),
    updatedAt: (data.updatedAt as Timestamp).toDate(),
  }
}

export class FirestoreCategoryRepository
  extends FirestoreRepository<Category>
  implements CategoryRepository
{
  constructor(db: Firestore, userId: string) {
    super(db, userId, 'categories', serialize, deserialize)
  }
}
