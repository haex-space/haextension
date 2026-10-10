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

  it('rejects at once for an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(navigator.credentials.get(getOptions({ signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' })
    expect(posted).toEqual([])
  })
})
