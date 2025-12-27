import { onMessage, sendMessage } from 'webext-bridge/background'
import { vaultConnection } from './connection'
import { MSG_CONNECT, MSG_CONNECTION_STATE, MSG_DISCONNECT, MSG_GET_CONNECTION_STATE, MSG_SET_ITEM, MSG_GET_PASSWORD_CONFIG, MSG_GET_PASSWORD_PRESETS } from '~/logic/messages'

// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import('/@vite/client')
  // load latest content script
  import('./contentScriptHMR')
}

// Initialize connection to haex-vault
vaultConnection.connect().catch((err) => {
  console.error('[haex-pass] Initial connection failed:', err)
})

// Listen for state changes and broadcast to popup/content scripts
vaultConnection.onStateChange((state) => {
  // Broadcast state to all extension pages
  browser.runtime.sendMessage({ type: MSG_CONNECTION_STATE, state }).catch(() => {
    // Ignore errors when no listeners
  })
})

browser.runtime.onInstalled.addListener((): void => {
  console.log('[haex-pass] Extension installed')
})

// Handle messages from extension pages (options, popup) via browser.runtime.sendMessage
browser.runtime.onMessage.addListener((msg: unknown): Promise<unknown> | undefined => {
  const message = msg as { type?: string }

  if (message.type === MSG_GET_CONNECTION_STATE) {
    return Promise.resolve(vaultConnection.getState())
  }

  if (message.type === MSG_CONNECT) {
    return vaultConnection.connect()
      .then(() => ({ success: true }))
      .catch(err => ({ success: false, error: String(err) }))
  }

  if (message.type === MSG_DISCONNECT) {
    vaultConnection.disconnect()
    return Promise.resolve({ success: true })
  }

  if (message.type === MSG_SET_ITEM) {
    const data = (msg as { data?: object }).data
    if (!data) {
      return Promise.resolve({ success: false, error: 'Missing data' })
    }
    return vaultConnection.setItem(data)
      .then((result) => {
        // Result from haex-pass is { requestId, success, data, error? }
        const haexResponse = result as { success: boolean, data?: unknown, error?: string }
        if (haexResponse.success) {
          return { success: true, data: haexResponse.data }
        }
        return { success: false, error: haexResponse.error || 'Unknown error' }
      })
      .catch(err => ({ success: false, error: String(err) }))
  }

  if (message.type === MSG_GET_PASSWORD_CONFIG) {
    return vaultConnection.getPasswordConfig()
      .then((result) => {
        const haexResponse = result as { success: boolean, data?: unknown, error?: string }
        if (haexResponse.success) {
          return { success: true, data: haexResponse.data }
        }
        return { success: false, error: haexResponse.error || 'Unknown error' }
      })
      .catch(err => ({ success: false, error: String(err) }))
  }

  if (message.type === MSG_GET_PASSWORD_PRESETS) {
    return vaultConnection.getPasswordPresets()
      .then((result) => {
        const haexResponse = result as { success: boolean, data?: unknown, error?: string }
        if (haexResponse.success) {
          return { success: true, data: haexResponse.data }
        }
        return { success: false, error: haexResponse.error || 'Unknown error' }
      })
      .catch(err => ({ success: false, error: String(err) }))
  }

  return undefined
})

// Handle messages from popup
onMessage('get-connection-state', async () => {
  return vaultConnection.getState()
})

onMessage('connect', async () => {
  try {
    await vaultConnection.connect()
    return { success: true }
  }
  catch (err) {
    return { success: false, error: String(err) }
  }
})

onMessage('disconnect', async () => {
  vaultConnection.disconnect()
  return { success: true }
})

// Handle open-popup request from content script
onMessage('open-popup', async () => {
  try {
    await browser.action.openPopup()
    return { success: true }
  } catch (err) {
    console.error('[haex-pass] Failed to open popup:', err)
    return { success: false, error: String(err) }
  }
})

// Handle messages from content scripts
onMessage('get-items', async (message) => {
  const { url, fields } = message.data as { url: string, fields: string[] }
  console.log('[haex-pass] get-items request:', { url, fields })
  console.log('[haex-pass] Connection state:', vaultConnection.getState())
  try {
    const result = await vaultConnection.getItems(url, fields)
    console.log('[haex-pass] get-items result:', result)
    return { success: true, data: result }
  }
  catch (err) {
    console.error('[haex-pass] get-items error:', err)
    return { success: false, error: String(err) }
  }
})

onMessage('fill-field', async (message) => {
  const { tabId, fieldId, value } = message.data as { tabId: number, fieldId: string, value: string }
  try {
    await sendMessage('fill-field', { fieldId, value }, { context: 'content-script', tabId })
    return { success: true }
  }
  catch (err) {
    return { success: false, error: String(err) }
  }
})

// Listen for tab updates to detect page loads with forms
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Notify content script that page is ready
    try {
      await sendMessage('page-loaded', { url: tab.url }, { context: 'content-script', tabId })
    }
    catch {
      // Content script may not be loaded yet
    }
  }
})
