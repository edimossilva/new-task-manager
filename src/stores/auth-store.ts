import { ref } from 'vue'
import { defineStore } from 'pinia'
import { decodeIdToken } from '@/adapters/google/decode-id-token'
import { disableGoogleAutoSelect } from '@/adapters/google/google-identity'
import {
  clearSession,
  readSession,
  saveSession,
  type GoogleUser,
} from '@/adapters/google/session-storage'
import { clearRepositories, initializeRepositories } from '@/adapters/repositories'

export type { GoogleUser }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<GoogleUser | null>(null)

  function startSession(profile: GoogleUser): void {
    user.value = profile
    saveSession(profile)
    initializeRepositories(profile.sub)
  }

  /**
   * Boot path, called from main.ts before the router is installed.
   * Synchronous on purpose: localStorage is the only source of truth here, and
   * mounting must never wait on the network.
   */
  function restoreSession(): void {
    const stored = readSession()
    if (stored) startSession(stored)
  }

  /** Called with the ID token from the Google Identity Services callback. */
  function completeSignIn(credential: string): void {
    const payload = decodeIdToken(credential)
    startSession({
      sub: payload.sub,
      name: payload.name ?? payload.email,
      email: payload.email,
      picture: payload.picture ?? '',
    })
  }

  function signOut(): void {
    disableGoogleAutoSelect()
    clearSession()
    user.value = null
    clearRepositories()
  }

  return { user, restoreSession, completeSignIn, signOut }
})
