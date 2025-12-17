const STORAGE_KEY_PORT = 'haex-pass-websocket-port'
const DEFAULT_PORT = 19455

// Target extension configuration
// These identify the haex-vault extension that handles password management requests
const STORAGE_KEY_EXTENSION_PUBLIC_KEY = 'haex-pass-extension-public-key'
const STORAGE_KEY_EXTENSION_NAME = 'haex-pass-extension-name'
const DEFAULT_EXTENSION_PUBLIC_KEY = 'b4401f13f65e576b8a30ff9fd83df82a8bb707e1994d40c99996fe88603cefca'
const DEFAULT_EXTENSION_NAME = 'haex-pass'

/**
 * Get the configured WebSocket port
 */
export async function getWebSocketPort(): Promise<number> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_PORT)
    const port = result[STORAGE_KEY_PORT]
    return typeof port === 'number' && port > 0 && port <= 65535 ? port : DEFAULT_PORT
  }
  catch {
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
 * Get the configured target extension public key
 */
export async function getExtensionPublicKey(): Promise<string> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_EXTENSION_PUBLIC_KEY)
    const key = result[STORAGE_KEY_EXTENSION_PUBLIC_KEY]
    return typeof key === 'string' && key.length > 0 ? key : DEFAULT_EXTENSION_PUBLIC_KEY
  }
  catch {
    return DEFAULT_EXTENSION_PUBLIC_KEY
  }
}

/**
 * Set the target extension public key
 */
export async function setExtensionPublicKey(key: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY_EXTENSION_PUBLIC_KEY]: key })
}

/**
 * Get the configured target extension name
 */
export async function getExtensionName(): Promise<string> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_EXTENSION_NAME)
    const name = result[STORAGE_KEY_EXTENSION_NAME]
    return typeof name === 'string' && name.length > 0 ? name : DEFAULT_EXTENSION_NAME
  }
  catch {
    return DEFAULT_EXTENSION_NAME
  }
}

/**
 * Set the target extension name
 */
export async function setExtensionName(name: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY_EXTENSION_NAME]: name })
}

/**
 * Get both extension identifiers at once
 */
export async function getExtensionIdentifiers(): Promise<{ publicKey: string, name: string }> {
  const [publicKey, name] = await Promise.all([
    getExtensionPublicKey(),
    getExtensionName(),
  ])
  return { publicKey, name }
}
