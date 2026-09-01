export interface GoogleUser {
  sub: string
  name: string
  email: string
  picture: string
}

const SESSION_KEY = 'new-task-manager:session'

/** Stores only the derived profile, never the raw ID token. */
export function saveSession(user: GoogleUser): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } catch (error) {
    console.error('Failed to persist the session to localStorage:', error)
  }
}

export function readSession(): GoogleUser | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleUser>
    // A truncated or hand-edited value must yield null rather than a half-built
    // user whose empty `sub` would become a bogus storage key.
    if (typeof parsed.sub !== 'string' || parsed.sub.length === 0) return null
    return {
      sub: parsed.sub,
      name: parsed.name ?? '',
      email: parsed.email ?? '',
      picture: parsed.picture ?? '',
    }
  } catch (error) {
    console.error('Failed to parse the stored session:', error)
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
