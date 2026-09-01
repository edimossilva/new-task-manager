import type { GoogleButtonConfiguration } from './gis-types'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

const BUTTON_CONFIG: GoogleButtonConfiguration = {
  type: 'standard',
  theme: 'outline',
  size: 'large',
  text: 'signin_with',
  shape: 'rectangular',
  locale: 'pt-BR',
  width: 320,
}

let scriptPromise: Promise<void> | null = null
let initialized = false

/**
 * Injects the GIS client script once; repeat calls share the same promise.
 *
 * A memoized loader rather than a <script async defer> tag in index.html: the
 * tag gives no readiness signal and no ordering guarantee against the module
 * graph, so we would still need a poll loop or a global callback.
 */
export function loadGoogleIdentity(): Promise<void> {
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.append(script)
  })

  return scriptPromise
}

export async function initializeGoogleIdentity(
  onCredential: (credential: string) => void,
): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set. See README.md for the Google Cloud setup.')
  }

  await loadGoogleIdentity()

  // LoginView remounts on every sign-out -> sign-in cycle, and re-running
  // initialize() can drop the registered callback.
  if (initialized) return

  window.google?.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    auto_select: false,
    cancel_on_tap_outside: true,
    ux_mode: 'popup',
  })
  initialized = true
}

export function renderGoogleButton(parent: HTMLElement): void {
  window.google?.accounts.id.renderButton(parent, BUTTON_CONFIG)
}

/**
 * Without this, One Tap silently signs the user straight back in on the next
 * visit to /login and sign-out looks broken. Optional-chained because the user
 * may sign out in a tab that restored a session and never loaded the script.
 */
export function disableGoogleAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect()
}
