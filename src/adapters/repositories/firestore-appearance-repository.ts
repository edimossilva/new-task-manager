import type { DocumentData, Firestore } from 'firebase/firestore'
import type { Appearance } from '@/entities'
import { APPEARANCE_ID, DEFAULT_ACCENT, DEFAULT_THEME, isInkName, isThemeName } from '@/entities'
import type { AppearanceRepository } from '@/usecases/ports'
import { FirestoreRepository } from './firestore-repository'

function serialize(appearance: Appearance): DocumentData {
  return { id: appearance.id, accent: appearance.accent, theme: appearance.theme }
}

function deserialize(data: DocumentData): Appearance {
  return {
    id: (data.id as string) ?? APPEARANCE_ID,
    // A value removed from the palette or theme set must not leave the app
    // unstyled -- and documents written before themes existed have no `theme`.
    accent: isInkName(data.accent) ? data.accent : DEFAULT_ACCENT,
    theme: isThemeName(data.theme) ? data.theme : DEFAULT_THEME,
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
