import { getFirestore, type Firestore } from 'firebase/firestore'
import { getFirebaseApp } from './firebase-app'

let db: Firestore | null = null

export function getFirestoreInstance(): Firestore {
  if (db) return db
  db = getFirestore(getFirebaseApp())
  return db
}
