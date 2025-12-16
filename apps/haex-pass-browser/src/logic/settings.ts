const STORAGE_KEY_PORT = 'haex-pass-websocket-port'
const DEFAULT_PORT = 19455

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
