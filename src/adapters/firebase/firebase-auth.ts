import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { getFirebaseApp } from './firebase-app'

const provider = new GoogleAuthProvider()

function getAuthInstance() {
  return getAuth(getFirebaseApp())
}

export function signInWithGoogle(): Promise<User> {
  return signInWithPopup(getAuthInstance(), provider).then((result) => result.user)
}

export function signOutUser(): Promise<void> {
  return getAuthInstance().signOut()
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getAuthInstance(), callback)
}
