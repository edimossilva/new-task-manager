import type { DocumentData, Firestore } from 'firebase/firestore'
import type { Appearance } from '@/entities'
import { APPEARANCE_ID, DEFAULT_ACCENT, isInkName } from '@/entities'
import type { AppearanceRepository } from '@/usecases/ports'
import { FirestoreRepository } from './firestore-repository'

function serialize(appearance: Appearance): DocumentData {
  return { id: appearance.id, accent: appearance.accent }
}

function deserialize(data: DocumentData): Appearance {
  return {
    id: (data.id as string) ?? APPEARANCE_ID,
    // An ink removed from the palette must not leave the app unstyled.
    accent: isInkName(data.accent) ? data.accent : DEFAULT_ACCENT,
  }
}

export class FirestoreAppearanceRepository
  extends FirestoreRepository<Appearance>
  implements AppearanceRepository
{
  constructor(db: Firestore, userId: string) {
    super(db, userId, 'settings', serialize, deserialize)
  }
}
