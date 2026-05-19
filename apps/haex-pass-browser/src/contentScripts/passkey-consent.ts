/**
 * Passkey consent prompt — runtime API.
 *
 * Bridge between the WebAuthn bridge (which needs an awaitable decision) and
 * the Vue overlay component (which renders the UI inside the existing
 * content-script Shadow DOM). The Vue side calls `registerPasskeyConsentUi`
 * once on mount to provide a handler; the bridge calls `requestPasskeyConsent`
 * each time a decision is needed.
 */

export interface PasskeyConsentRequest {
  rpId: string
  rpDisplayName: string
  kind: 'create' | 'get'
}

export interface PasskeyConsentDecision {
  choice: 'haex-pass' | 'browser'
  remember: boolean
}

type Handler = (req: PasskeyConsentRequest) => Promise<PasskeyConsentDecision | null>

let handler: Handler | null = null
const pendingWhileUnmounted: Array<{
  req: PasskeyConsentRequest
  resolve: (value: PasskeyConsentDecision | null) => void
}> = []

/**
 * Called by the Vue overlay once it is mounted and ready to receive prompts.
 * Replays any decisions queued while the UI was still loading.
 */
export function registerPasskeyConsentUi(impl: Handler): void {
  handler = impl
  while (pendingWhileUnmounted.length > 0) {
    const next = pendingWhileUnmounted.shift()!
    impl(next.req).then(next.resolve, () => next.resolve(null))
  }
}

/**
 * Ask the user how to handle this WebAuthn request. Resolves with the
 * decision (and whether to remember it), or null if the user cancelled
 * without picking.
 */
export function requestPasskeyConsent(req: PasskeyConsentRequest): Promise<PasskeyConsentDecision | null> {
  if (handler)
    return handler(req)
  // Overlay not mounted yet — wait for the next registration call. WebAuthn
  // calls early in document lifecycle are rare, so this normally never fires.
  return new Promise((resolve) => {
    pendingWhileUnmounted.push({ req, resolve })
  })
}
