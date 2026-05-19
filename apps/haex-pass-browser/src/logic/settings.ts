const STORAGE_KEY_PORT = 'haex-pass-websocket-port'
const DEFAULT_PORT = 19455

const STORAGE_KEY_PASSKEY_PREFS = 'haex-pass-passkey-prefs-by-rp'

/** Per-relying-party choice for who handles WebAuthn. */
export type PasskeyHandler = 'haex-pass' | 'browser'

/** Map keyed by WebAuthn relying-party id (typically eTLD+1). */
export type PasskeyPrefs = Record<string, { choice: PasskeyHandler, setAt: string }>

/**
 * Get the configured WebSocket port
 */
export async function getWebSocketPort(): Promise<number> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_PORT)
    const port = result[STORAGE_KEY_PORT]
    return typeof port === 'number' && port > 0 && port <= 65535 ? port : DEFAULT_PORT
  } catch {
    return DEFAULT_PORT
  }
}

/**
 * Set the WebSocket port
 */
export async function setWebSocketPort(port: number): Promise<void> {
  if (port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535')
  }
  await browser.storage.local.set({ [STORAGE_KEY_PORT]: port })
}

/**
 * Get the default WebSocket port
 */
export function getDefaultPort(): number {
  return DEFAULT_PORT
}

/**
 * Load all stored passkey decisions, keyed by relying-party id.
 */
export async function getAllPasskeyPrefs(): Promise<PasskeyPrefs> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_PASSKEY_PREFS)
    const value = result[STORAGE_KEY_PASSKEY_PREFS]
    return value && typeof value === 'object' ? value as PasskeyPrefs : {}
  } catch {
    return {}
  }
}

/**
 * Look up the user's decision for one relying party, or null if no preference
 * is stored yet.
 */
export async function getPasskeyPref(rpId: string): Promise<PasskeyHandler | null> {
  const prefs = await getAllPasskeyPrefs()
  return prefs[rpId]?.choice ?? null
}

/**
 * Persist a decision for one relying party. Overwrites any previous value.
 */
export async function setPasskeyPref(rpId: string, choice: PasskeyHandler): Promise<void> {
  const prefs = await getAllPasskeyPrefs()
  prefs[rpId] = { choice, setAt: new Date().toISOString() }
  await browser.storage.local.set({ [STORAGE_KEY_PASSKEY_PREFS]: prefs })
}

/**
 * Forget the decision for one relying party — next time the user visits, the
 * consent prompt will appear again.
 */
export async function removePasskeyPref(rpId: string): Promise<void> {
  const prefs = await getAllPasskeyPrefs()
  if (!(rpId in prefs))
    return
  delete prefs[rpId]
  await browser.storage.local.set({ [STORAGE_KEY_PASSKEY_PREFS]: prefs })
}
