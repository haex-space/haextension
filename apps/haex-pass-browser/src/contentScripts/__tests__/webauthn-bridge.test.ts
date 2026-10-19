import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPasskeyPref, setPasskeyPref } from '~/logic/settings'
import { requestPasskeyConsent } from '../passkey-consent'
import { initWebAuthnBridge } from '../webauthn-bridge'

vi.mock('webext-bridge/content-script', () => ({ sendMessage: vi.fn() }))
vi.mock('~/logic/settings', () => ({
  getPasskeyPref: vi.fn(async () => null),
  setPasskeyPref: vi.fn(async () => {}),
}))
vi.mock('../passkey-consent', () => ({
  requestPasskeyConsent: vi.fn(async () => ({ choice: 'browser', remember: true })),
}))

interface PostedMessage {
  type: string
  requestId: string
  error?: string
}

let posted: PostedMessage[] = []

function postFromPage(data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, source: window }))
}

function createRequest(relyingPartyId: string) {
  return {
    type: 'HAEX_PASS_WEBAUTHN_CREATE',
    requestId: `req-${relyingPartyId}`,
    data: { relyingPartyId, relyingPartyName: 'Bank', userHandle: 'aA==', userName: 'anna', challenge: 'AQ==' },
  }
}

beforeAll(() => {
  initWebAuthnBridge()
})

beforeEach(() => {
  posted = []
  vi.spyOn(window, 'postMessage').mockImplementation((message: PostedMessage) => {
    posted.push(message)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(requestPasskeyConsent).mockClear()
  vi.mocked(setPasskeyPref).mockClear()
  vi.mocked(getPasskeyPref).mockClear()
})

describe('webauthn-bridge', () => {
  it('hands a request for another site to the browser without prompting', async () => {
    postFromPage(createRequest('bank.com'))

    await vi.waitFor(() => expect(posted).toContainEqual(expect.objectContaining({
      type: 'HAEX_PASS_WEBAUTHN_RESPONSE_CREATE',
      requestId: 'req-bank.com',
      error: 'USE_BROWSER_NATIVE',
    })))
    expect(requestPasskeyConsent).not.toHaveBeenCalled()
    expect(getPasskeyPref).not.toHaveBeenCalled()
    expect(setPasskeyPref).not.toHaveBeenCalled()
  })

  it('asks the user for a request of the page\'s own site', async () => {
    postFromPage(createRequest(location.hostname))

    await vi.waitFor(() => expect(posted).toContainEqual(expect.objectContaining({
      type: 'HAEX_PASS_WEBAUTHN_RESPONSE_CREATE',
      error: 'USE_BROWSER_NATIVE',
    })))
    expect(requestPasskeyConsent).toHaveBeenCalledOnce()
    expect(setPasskeyPref).toHaveBeenCalledWith(location.hostname, 'browser')
  })

  it('ignores malformed requests', () => {
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error)
    window.addEventListener('error', onError)
    postFromPage(null)
    postFromPage({ type: 'HAEX_PASS_WEBAUTHN_GET', requestId: 'x' })
    window.removeEventListener('error', onError)

    expect(errors).toEqual([])
    expect(posted).toEqual([])
  })
})
