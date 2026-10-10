/**
 * WebAuthn Bridge
 *
 * Verbindet das WebAuthn-Inject Script (MAIN world) mit dem Background-Script
 * und entscheidet pro Relying-Party, ob die Anfrage über haex-vault läuft
 * oder an die Browser-native WebAuthn-Implementierung durchgereicht wird.
 *
 * Entscheidungsfluss bei einer Anfrage:
 *   1. Lookup gespeicherter User-Wahl für die rp.id.
 *   2. Bei Treffer: Anfrage entsprechend routen.
 *   3. Bei Miss: Consent-Prompt im Page-Overlay anzeigen, Wahl + optional
 *      "merken" abwarten, anschließend routen.
 */

import type { PasskeyHandler } from '~/logic/settings'
import { sendMessage } from 'webext-bridge/content-script'
import { getPasskeyPref, setPasskeyPref } from '~/logic/settings'
import { requestPasskeyConsent } from './passkey-consent'
import { parseVaultPasskeys, vaultCanAnswerGet } from './webauthn-routing'

interface WebAuthnCreateRequest {
  type: 'HAEX_PASS_WEBAUTHN_CREATE'
  requestId: string
  data: {
    relyingPartyId: string
    relyingPartyName: string
    userHandle: string
    userName: string
    userDisplayName?: string
    challenge: string
    excludeCredentials?: string[]
    requireResidentKey?: boolean
    userVerification?: 'required' | 'preferred' | 'discouraged'
  }
}

interface WebAuthnGetRequest {
  type: 'HAEX_PASS_WEBAUTHN_GET'
  requestId: string
  data: {
    relyingPartyId: string
    challenge: string
    allowCredentials?: Array<{
      id: string
      type: 'public-key'
      transports?: string[]
    }>
    userVerification?: 'required' | 'preferred' | 'discouraged'
  }
}

interface WebAuthnAbortRequest {
  type: 'HAEX_PASS_WEBAUTHN_ABORT'
  requestId: string
}

type WebAuthnRequest = WebAuthnCreateRequest | WebAuthnGetRequest | WebAuthnAbortRequest

// One controller per request the inject script is still waiting for, so a
// page-side abort can close the consent prompt.
const inFlight = new Map<string, AbortController>()

// Sentinel error consumed by webauthn-inject.ts to trigger the
// originalCreate/originalGet fallback path. Anything else is treated as a
// real failure and surfaced to the page.
const USE_BROWSER_NATIVE = 'USE_BROWSER_NATIVE'

function sendResponse(requestId: string, type: 'create' | 'get', data?: unknown, error?: string) {
  const responseType = type === 'create'
    ? 'HAEX_PASS_WEBAUTHN_RESPONSE_CREATE'
    : 'HAEX_PASS_WEBAUTHN_RESPONSE_GET'

  window.postMessage({
    type: responseType,
    requestId,
    data,
    error,
  }, '*')
}

/**
 * Determine who should handle this WebAuthn call. Returns the stored choice
 * if any, otherwise shows the consent prompt and returns the user's pick.
 * If the user cancels the prompt, returns null and the caller should report
 * a failure (rather than falling back silently).
 */
async function resolveHandler(
  rpId: string,
  rpDisplayName: string,
  kind: 'create' | 'get',
  signal: AbortSignal,
): Promise<PasskeyHandler | null> {
  const existing = await getPasskeyPref(rpId)
  if (existing)
    return existing

  const decision = await requestPasskeyConsent({
    rpId,
    rpDisplayName,
    kind,
  }, signal)
  if (!decision)
    return null

  if (decision.remember) {
    await setPasskeyPref(rpId, decision.choice).catch((err) => {
      console.warn('[HaexPass Bridge] Failed to persist passkey preference:', err)
    })
  }
  return decision.choice
}

async function handleWebAuthnCreate(request: WebAuthnCreateRequest, signal: AbortSignal) {
  const { relyingPartyId, relyingPartyName } = request.data

  const handler = await resolveHandler(relyingPartyId, relyingPartyName || relyingPartyId, 'create', signal)
  if (handler === null) {
    sendResponse(request.requestId, 'create', undefined, 'User cancelled passkey handler selection')
    return
  }
  if (handler === 'browser') {
    sendResponse(request.requestId, 'create', undefined, USE_BROWSER_NATIVE)
    return
  }

  try {
    const response = await sendMessage('passkey-create', request.data, 'background')
    if (response && (response as { success: boolean }).success) {
      sendResponse(request.requestId, 'create', (response as { data?: unknown }).data)
    } else {
      const errorResponse = response as { error?: string }
      sendResponse(request.requestId, 'create', undefined, errorResponse.error || 'Unknown error')
    }
  } catch (err) {
    console.error('[HaexPass Bridge] Create error:', err)
    sendResponse(request.requestId, 'create', undefined, 'NO_HAEX_PASS_CONNECTION')
  }
}

/** Whether the vault holds a passkey that could answer this sign-in; false when it cannot be asked. */
async function vaultHasPasskeyFor(data: WebAuthnGetRequest['data']): Promise<boolean> {
  try {
    const response = await sendMessage('passkey-list', { relyingPartyId: data.relyingPartyId }, 'background') as { success?: boolean, passkeys?: unknown }
    if (!response?.success)
      return false
    const allowedIds = data.allowCredentials?.map(cred => cred.id) ?? []
    return vaultCanAnswerGet(parseVaultPasskeys(response), allowedIds)
  } catch {
    return false
  }
}

async function handleWebAuthnGet(request: WebAuthnGetRequest, signal: AbortSignal) {
  const { relyingPartyId } = request.data

  // Only a sign-in the vault can answer is worth a prompt; anything else (a
  // YubiKey, a passkey kept by the browser) goes straight to the browser.
  if (await getPasskeyPref(relyingPartyId) !== 'browser' && !(await vaultHasPasskeyFor(request.data))) {
    sendResponse(request.requestId, 'get', undefined, USE_BROWSER_NATIVE)
    return
  }

  const handler = await resolveHandler(relyingPartyId, relyingPartyId, 'get', signal)
  if (handler === null) {
    sendResponse(request.requestId, 'get', undefined, 'User cancelled passkey handler selection')
    return
  }
  if (handler === 'browser') {
    sendResponse(request.requestId, 'get', undefined, USE_BROWSER_NATIVE)
    return
  }

  try {
    const response = await sendMessage('passkey-get', request.data, 'background')
    if (response && (response as { success: boolean }).success) {
      sendResponse(request.requestId, 'get', (response as { data?: unknown }).data)
    } else {
      const errorResponse = response as { error?: string }
      sendResponse(request.requestId, 'get', undefined, errorResponse.error || 'Unknown error')
    }
  } catch (err) {
    console.error('[HaexPass Bridge] Get error:', err)
    sendResponse(request.requestId, 'get', undefined, 'NO_HAEX_PASS_CONNECTION')
  }
}

function handleMessage(event: MessageEvent) {
  if (event.source !== window)
    return

  const message = event.data as WebAuthnRequest
  if (!message.type?.startsWith('HAEX_PASS_WEBAUTHN_'))
    return

  if (message.type === 'HAEX_PASS_WEBAUTHN_ABORT') {
    inFlight.get(message.requestId)?.abort()
    return
  }
  // Our own ACKs and responses come back through this listener too.
  if (message.type !== 'HAEX_PASS_WEBAUTHN_CREATE' && message.type !== 'HAEX_PASS_WEBAUTHN_GET')
    return

  // Tells the inject script someone is listening; without this ack it
  // hands the request to the browser after a short wait.
  window.postMessage({ type: 'HAEX_PASS_WEBAUTHN_ACK', requestId: message.requestId }, '*')

  const controller = new AbortController()
  inFlight.set(message.requestId, controller)
  const handled = message.type === 'HAEX_PASS_WEBAUTHN_CREATE'
    ? handleWebAuthnCreate(message, controller.signal)
    : handleWebAuthnGet(message, controller.signal)
  void handled.finally(() => inFlight.delete(message.requestId))
}

export function initWebAuthnBridge() {
  window.addEventListener('message', handleMessage)
}
