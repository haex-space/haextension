// Transports haex-vault advertises for the passkeys it creates. A credential
// listed with transports outside this set lives on a roaming authenticator
// (YubiKey and friends), which haex-vault can never answer for.
const VAULT_TRANSPORTS: readonly string[] = ['internal', 'hybrid']

function onlyHardwareKeysAllowed(allowCredentials: readonly PublicKeyCredentialDescriptor[] | undefined): boolean {
  if (!allowCredentials?.length)
    return false
  return allowCredentials.every(cred =>
    cred.transports?.length
    && !cred.transports.some(transport => VAULT_TRANSPORTS.includes(transport)),
  )
}

/**
 * Decide whether a WebAuthn call must go straight to the browser without
 * asking the user or contacting haex-vault.
 *
 * - `mediation: 'conditional'` is the passkey-autofill request many login
 *   pages start on load (or, on create, the silent passkey upgrade after a
 *   password login); haex-pass offers no conditional UI, and a modal prompt
 *   would sit in front of the security-key flow the page starts next.
 * - A registration that demands a cross-platform authenticator, or an
 *   assertion whose allowed credentials are all hardware-key credentials,
 *   cannot be served by haex-vault.
 */
export function mustUseBrowserNative(
  kind: 'create' | 'get',
  options: CredentialCreationOptions | CredentialRequestOptions,
): boolean {
  // lib.dom only types `mediation` on request options; browsers accept it on create too.
  const { mediation } = options as { mediation?: CredentialMediationRequirement }
  if (mediation === 'conditional')
    return true
  if (kind === 'create') {
    const publicKey = (options as CredentialCreationOptions).publicKey
    return publicKey?.authenticatorSelection?.authenticatorAttachment === 'cross-platform'
  }
  return onlyHardwareKeysAllowed((options as CredentialRequestOptions).publicKey?.allowCredentials)
}

/** The part of a vault passkey that decides whether it can answer a sign-in. */
export interface VaultPasskey {
  credentialId: string
  isDiscoverable: boolean
}

/**
 * Whether one of the vault's passkeys for this site can answer the sign-in,
 * by the same rule haex-vault's passkey-get applies: an allow-list asks for
 * one of those credential ids (standard Base64 on both sides), no allow-list
 * asks for any discoverable passkey.
 */
export function vaultCanAnswerGet(passkeys: readonly VaultPasskey[], allowedCredentialIds: readonly string[]): boolean {
  if (allowedCredentialIds.length === 0)
    return passkeys.some(passkey => passkey.isDiscoverable)
  return passkeys.some(passkey => allowedCredentialIds.includes(passkey.credentialId))
}

/** Read the vault's passkey-list answer, keeping only well-formed entries. */
export function parseVaultPasskeys(data: unknown): VaultPasskey[] {
  const passkeys = (data as { passkeys?: unknown } | null | undefined)?.passkeys
  if (!Array.isArray(passkeys))
    return []
  return passkeys.flatMap((entry: unknown) => {
    const { credentialId, isDiscoverable } = (entry ?? {}) as Partial<Record<keyof VaultPasskey, unknown>>
    return typeof credentialId === 'string' && typeof isDiscoverable === 'boolean'
      ? [{ credentialId, isDiscoverable }]
      : []
  })
}
