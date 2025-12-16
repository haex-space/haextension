import { onMessage, sendMessage } from 'webext-bridge/background'
import { vaultConnection } from './connection'

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
  browser.runtime.sendMessage({ type: 'connection-state', state }).catch(() => {
    // Ignore errors when no listeners
  })
})

browser.runtime.onInstalled.addListener((): void => {
  console.log('[haex-pass] Extension installed')
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

// Handle messages from content scripts
onMessage('get-logins', async (message) => {
  const { url, fields } = message.data as { url: string, fields: string[] }
  console.log('[haex-pass] get-logins request:', { url, fields })
  console.log('[haex-pass] Connection state:', vaultConnection.getState())
  try {
    const result = await vaultConnection.getLogins(url, fields)
    console.log('[haex-pass] get-logins result:', result)
    return { success: true, data: result }
  }
  catch (err) {
    console.error('[haex-pass] get-logins error:', err)
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
