import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface PostedMessage {
  type: string
  requestId: string
  data?: unknown
  error?: string
}

const browserCredential = { id: 'from-browser' } as Credential
const nativeGet = vi.fn<(options?: CredentialRequestOptions) => Promise<Credential | null>>()
const nativeCreate = vi.fn<(options?: CredentialCreationOptions) => Promise<Credential | null>>()
let posted: PostedMessage[] = []

function getOptions(extra: Partial<CredentialRequestOptions> = {}): CredentialRequestOptions {
  return { publicKey: { challenge: new Uint8Array([1, 2, 3]), rpId: 'example.com' }, ...extra }
}

/** Answer as the content-script bridge would, from the page's own window. */
function reply(message: PostedMessage) {
  window.dispatchEvent(new MessageEvent('message', { data: message, source: window }))
}

function lastRequest(): PostedMessage {
  const request = posted.findLast(m => m.type === 'HAEX_PASS_WEBAUTHN_GET')
  if (!request)
    throw new Error('no request was posted to the bridge')
  return request
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  nativeGet.mockReset().mockResolvedValue(browserCredential)
  nativeCreate.mockReset().mockResolvedValue(browserCredential)
  posted = []
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { get: nativeGet, create: nativeCreate },
  })
  vi.spyOn(window, 'postMessage').mockImplementation((message: PostedMessage) => {
    posted.push(message)
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await import('../webauthn-inject')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('webauthn-inject', () => {
  it('passes hardware-key assertions straight to the browser', async () => {
    const options = getOptions({
      publicKey: {
        challenge: new Uint8Array([1]),
        allowCredentials: [{ type: 'public-key', id: new Uint8Array([9]), transports: ['usb'] }],
      },
    })

    await expect(navigator.credentials.get(options)).resolves.toBe(browserCredential)
    expect(nativeGet).toHaveBeenCalledWith(options)
    expect(posted).toEqual([])
  })

  it('falls back to the browser when the bridge never acknowledges', async () => {
    const options = getOptions()
    const result = navigator.credentials.get(options)
    expect(lastRequest().type).toBe('HAEX_PASS_WEBAUTHN_GET')

    await vi.advanceTimersByTimeAsync(2000)

    await expect(result).resolves.toBe(browserCredential)
    expect(nativeGet).toHaveBeenCalledWith(options)
  })

  it('waits for the user once the bridge acknowledged', async () => {
    const result = navigator.credentials.get(getOptions())
    reply({ type: 'HAEX_PASS_WEBAUTHN_ACK', requestId: lastRequest().requestId })

    await vi.advanceTimersByTimeAsync(60_000)
    expect(nativeGet).not.toHaveBeenCalled()

    reply({ type: 'HAEX_PASS_WEBAUTHN_RESPONSE_GET', requestId: lastRequest().requestId, error: 'USE_BROWSER_NATIVE' })
    await expect(result).resolves.toBe(browserCredential)
  })

  it('rejects with the abort reason and tells the bridge when the page aborts', async () => {
    const controller = new AbortController()
    const result = navigator.credentials.get(getOptions({ signal: controller.signal }))
    const { requestId } = lastRequest()

    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(posted).toContainEqual({ type: 'HAEX_PASS_WEBAUTHN_ABORT', requestId })

    await vi.advanceTimersByTimeAsync(2000)
    expect(nativeGet).not.toHaveBeenCalled()
  })

  it('rejects like the browser when the user cancels the haex-pass prompt', async () => {
    const result = navigator.credentials.get(getOptions())
    reply({ type: 'HAEX_PASS_WEBAUTHN_ACK', requestId: lastRequest().requestId })

    reply({ type: 'HAEX_PASS_WEBAUTHN_RESPONSE_GET', requestId: lastRequest().requestId, error: 'USER_CANCELLED' })

    await expect(result).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(nativeGet).not.toHaveBeenCalled()
  })

  it('builds a registration credential with authenticator data and a JSON form', async () => {
    const authData = [1, 2, 3, 4]
    // CBOR { "authData": h'01020304' }
    const attestationObject = btoa(String.fromCharCode(0xA1, 0x68, ...new TextEncoder().encode('authData'), 0x44, ...authData))
    const result = navigator.credentials.create({
      publicKey: {
        rp: { id: 'example.com', name: 'Example' },
        user: { id: new Uint8Array([7]), name: 'anna', displayName: 'Anna' },
        challenge: new Uint8Array([1]),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    })
    const { requestId } = posted.findLast(m => m.type === 'HAEX_PASS_WEBAUTHN_CREATE')!
    reply({ type: 'HAEX_PASS_WEBAUTHN_ACK', requestId })
    reply({
      type: 'HAEX_PASS_WEBAUTHN_RESPONSE_CREATE',
      requestId,
      data: { credentialId: btoa('\x0A\x0B'), publicKey: btoa('spki'), publicKeyCose: '', attestationObject, clientDataJson: btoa('{}'), transports: ['internal'] },
    })

    const credential = await result as PublicKeyCredential & { response: AuthenticatorAttestationResponse }
    expect([...new Uint8Array(credential.response.getAuthenticatorData())]).toEqual(authData)
    expect(JSON.parse(JSON.stringify(credential))).toMatchObject({
      id: 'Cgs',
      rawId: 'Cgs',
      type: 'public-key',
      response: { authenticatorData: 'AQIDBA', transports: ['internal'], publicKeyAlgorithm: -7 },
      clientExtensionResults: {},
    })
  })

  it('ignores window messages that carry no object', () => {
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error)
    window.addEventListener('error', onError)
    window.dispatchEvent(new MessageEvent('message', { data: null, source: window }))
    window.dispatchEvent(new MessageEvent('message', { data: undefined, source: window }))
    window.removeEventListener('error', onError)

    expect(errors).toEqual([])
  })

  it('rejects at once for an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(navigator.credentials.get(getOptions({ signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' })
    expect(posted).toEqual([])
  })
})
