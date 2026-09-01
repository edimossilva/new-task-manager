export interface GoogleIdTokenPayload {
  sub: string
  email: string
  name?: string
  picture?: string
  exp: number
}

/**
 * Reads the payload of a Google ID token.
 *
 * This DECODES, it does not VERIFY: the signature, `iss`, `aud` and `exp` are
 * never checked. That is acceptable only because the token is never presented to
 * a server and grants no authority — it is just a convenient carrier for the
 * profile Google handed to this page. Do not repurpose it as a security check.
 */
export function decodeIdToken(token: string): GoogleIdTokenPayload {
  const segment = token.split('.')[1]
  if (!segment) throw new Error('Malformed Google ID token')

  // base64url -> base64, then re-pad: atob rejects the base64url alphabet.
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)

  // atob yields a binary string, which mangles multi-byte UTF-8 -- accented
  // names would come back as mojibake. The TextDecoder round-trip fixes that.
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as GoogleIdTokenPayload

  if (!payload.sub) throw new Error('Google ID token has no subject')
  return payload
}
