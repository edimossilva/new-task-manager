import { ref } from 'vue'
import { defineStore } from 'pinia'
import { signInWithGoogle, signOutUser, onAuthStateChange } from '@/adapters/firebase/firebase-auth'
import { initializeRepositories, clearRepositories } from '@/adapters/repositories'

interface AuthUser {
  uid: string
  displayName: string | null
  photoURL: string | null
  email: string | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const loading = ref(true)

  function setupSession(firebaseUser: {
    uid: string
    displayName: string | null
    photoURL: string | null
    email: string | null
  }): void {
    user.value = {
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      email: firebaseUser.email,
    }

    // Storage keys are namespaced by uid, so each account gets its own dataset.
    initializeRepositories(firebaseUser.uid)
  }

  function listenToAuthState(): Promise<void> {
    return new Promise((resolve) => {
      onAuthStateChange((firebaseUser) => {
        if (firebaseUser) {
          setupSession(firebaseUser)
        } else {
          user.value = null
          clearRepositories()
        }
        loading.value = false
        resolve()
      })
    })
  }

  async function signIn(): Promise<void> {
    const firebaseUser = await signInWithGoogle()
    setupSession(firebaseUser)
  }

  async function signOut(): Promise<void> {
    await signOutUser()
    user.value = null
    clearRepositories()
  }

  return { user, loading, listenToAuthState, signIn, signOut }
})
