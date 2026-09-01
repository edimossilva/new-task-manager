/**
 * The slice of the Google Identity Services API this app actually uses.
 * Hand-written rather than pulled from DefinitelyTyped: the real surface is far
 * larger than we need and this keeps the dependency list minimal.
 */
export interface GoogleCredentialResponse {
  credential: string
  select_by?: string
  clientId?: string
}

export interface GoogleIdConfiguration {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
  ux_mode?: 'popup' | 'redirect'
}

export interface GoogleButtonConfiguration {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'small' | 'medium' | 'large'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  locale?: string
  /** Pixels, max 400. A CSS string is silently ignored. */
  width?: number
}

export interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void
  renderButton(parent: HTMLElement, config: GoogleButtonConfiguration): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId
      }
    }
  }
}
