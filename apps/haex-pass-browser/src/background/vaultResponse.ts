/** The reply the background sends to extension pages and content scripts. */
export interface BridgeResult {
  success: boolean
  data?: unknown
  error?: string
}

/** Unwraps a vault answer (`{ requestId, success, data, error }`). */
export function toBridgeResult(answer: unknown): BridgeResult {
  const response = answer as { success?: unknown, data?: unknown, error?: unknown } | null | undefined
  if (response?.success === true)
    return { success: true, data: response.data }
  return { success: false, error: typeof response?.error === 'string' && response.error !== '' ? response.error : 'Unknown error' }
}

/** Replies with a vault request's unwrapped answer, or with why it failed. */
export function relayVaultRequest(request: Promise<unknown>): Promise<BridgeResult> {
  return request.then(toBridgeResult, err => ({ success: false, error: String(err) }))
}
