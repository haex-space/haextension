import { describe, expect, it } from 'vitest'
import { mustUseBrowserNative, parseVaultPasskeys, vaultCanAnswerGet } from '../webauthn-routing'

const challenge = new Uint8Array([1, 2, 3])

function getOptions(allowCredentials?: PublicKeyCredentialDescriptor[], mediation?: CredentialMediationRequirement): CredentialRequestOptions {
  return { mediation, publicKey: { challenge, allowCredentials } }
}

function credential(transports?: AuthenticatorTransport[]): PublicKeyCredentialDescriptor {
  return { type: 'public-key', id: new Uint8Array([9]), transports }
}

function createOptions(authenticatorAttachment?: AuthenticatorAttachment): CredentialCreationOptions {
  return {
    publicKey: {
      challenge,
      rp: { id: 'example.com', name: 'Example' },
      user: { id: new Uint8Array([7]), name: 'alice', displayName: 'Alice' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { authenticatorAttachment },
    },
  }
}

describe('mustUseBrowserNative', () => {
  it('sends conditional (autofill) requests to the browser', () => {
    expect(mustUseBrowserNative('get', getOptions(undefined, 'conditional'))).toBe(true)
  })

  it('sends assertions limited to hardware-key credentials to the browser', () => {
    expect(mustUseBrowserNative('get', getOptions([credential(['usb', 'nfc']), credential(['ble'])]))).toBe(true)
  })

  it('lets haex-pass handle discoverable assertions without allowCredentials', () => {
    expect(mustUseBrowserNative('get', getOptions())).toBe(false)
    expect(mustUseBrowserNative('get', getOptions([]))).toBe(false)
  })

  it('lets haex-pass handle assertions that may match a vault passkey', () => {
    expect(mustUseBrowserNative('get', getOptions([credential(['usb']), credential(['internal', 'hybrid'])]))).toBe(false)
    // Without transports the credential could be anyone's, including the vault's.
    expect(mustUseBrowserNative('get', getOptions([credential()]))).toBe(false)
  })

  it('sends registrations that demand a roaming authenticator to the browser', () => {
    expect(mustUseBrowserNative('create', createOptions('cross-platform'))).toBe(true)
    expect(mustUseBrowserNative('create', createOptions('platform'))).toBe(false)
    expect(mustUseBrowserNative('create', createOptions())).toBe(false)
  })
})

describe('vaultCanAnswerGet', () => {
  const discoverable = { credentialId: 'AAEC', isDiscoverable: true }
  const nonDiscoverable = { credentialId: 'AwQF', isDiscoverable: false }

  it('needs a listed credential id when the site sends an allow-list', () => {
    expect(vaultCanAnswerGet([discoverable, nonDiscoverable], ['AwQF'])).toBe(true)
    // The YubiKey case: the site only lists the hardware key's credential.
    expect(vaultCanAnswerGet([discoverable], ['eXViaWtleQ=='])).toBe(false)
  })

  it('needs a discoverable passkey when the site sends no allow-list', () => {
    expect(vaultCanAnswerGet([discoverable], [])).toBe(true)
    expect(vaultCanAnswerGet([nonDiscoverable], [])).toBe(false)
    expect(vaultCanAnswerGet([], [])).toBe(false)
  })
})

describe('parseVaultPasskeys', () => {
  it('keeps well-formed entries and drops the rest', () => {
    expect(parseVaultPasskeys({
      passkeys: [
        { credentialId: 'AAEC', isDiscoverable: true, userName: 'alice' },
        { credentialId: 42, isDiscoverable: true },
        null,
        { credentialId: 'AwQF' },
      ],
    })).toEqual([{ credentialId: 'AAEC', isDiscoverable: true }])
  })

  it('returns nothing for a malformed answer', () => {
    expect(parseVaultPasskeys(undefined)).toEqual([])
    expect(parseVaultPasskeys({ passkeys: 'nope' })).toEqual([])
  })
})
