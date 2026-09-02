import { ref } from 'vue'
import { defineStore } from 'pinia'
import { signInWithGoogle, signOutUser, onAuthStateChange } from '@/adapters/firebase/firebase-auth'
import { getFirestoreInstance } from '@/adapters/firebase/firebase-firestore'
import {
  initializeRepositories,
  clearRepositories,
} from '@/adapters/repositories/repository-provider'
import { useAppearanceStore } from './appearance-store'

interface AuthUser {
  uid: string
  displayName: string | null
  photoURL: string | null
  email: string | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const loading = ref(true)

  async function setupSession(firebaseUser: {
    uid: string
    displayName: string | null
    photoURL: string | null
    email: string | null
  }): Promise<void> {
    user.value = {
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      email: firebaseUser.email,
    }

    await initializeRepositories(getFirestoreInstance(), firebaseUser.uid)

    // Before the app mounts, so the accent is right on the first paint.
    useAppearanceStore().load()
  }

  function listenToAuthState(): Promise<void> {
    return new Promise((resolve) => {
      onAuthStateChange(async (firebaseUser) => {
        if (firebaseUser) {
          await setupSession(firebaseUser)
        } else {
          user.value = null
          clearRepositories()
          useAppearanceStore().reset()
        }
        loading.value = false
        resolve()
      })
    })
  }

  async function signIn(): Promise<void> {
    const firebaseUser = await signInWithGoogle()
    await setupSession(firebaseUser)
  }

  async function signOut(): Promise<void> {
    await signOutUser()
    user.value = null
    clearRepositories()
    // The store outlives the session; the next user starts from the default.
    useAppearanceStore().reset()
  }

  return { user, loading, listenToAuthState, signIn, signOut }
})
