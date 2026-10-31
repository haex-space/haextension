/* eslint-disable no-console */
import type { GetTotpResponseData, ItemEntry } from '~/logic/haexPassApi'
import { sendMessage } from 'webext-bridge/content-script'
import { createApp } from 'vue'
import App from './views/App.vue'
import { setupApp } from '~/logic/common-setup'
import { parseItemEntries } from '~/logic/haexPassApi'
import { DEFAULT_ALIASES, fillAllFields, isOtpField, shouldShowIconForField } from './autofill'
import { detectInputFields, type DetectedField } from './detector'
import { showEntryDropdown } from './entryDropdown'
import { attachFieldIcon } from './fieldIcon'
import { initWebAuthnBridge } from './webauthn-bridge'

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
;(() => {
  console.info('[haex-pass] Content script loaded')

  // Initialize WebAuthn bridge for passkey support
  initWebAuthnBridge()

  // State
  let detectedFields: DetectedField[] = []
  let matchingEntries: ItemEntry[] = []

  // Mount the Vue app for overlay UI (dropdowns, icons)
  const container = document.createElement('div')
  container.id = __NAME__
  const root = document.createElement('div')
  const styleEl = document.createElement('link')
  const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? 'open' : 'closed' }) || container
  styleEl.setAttribute('rel', 'stylesheet')
  styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'))
  shadowDOM.appendChild(styleEl)
  shadowDOM.appendChild(root)
  document.body.appendChild(container)
  const app = createApp(App)
  setupApp(app, { theme: false }).catch(err => console.error('[haex-pass] Failed to set up the overlay app:', err))
  app.mount(root)

  // Maps detected field types to canonical vault field keys.
  // 'text' fields pass isLoginField only when inside a login form context,
  // so they are treated as username candidates.
  const fieldTypeToCanonical: Record<string, string> = {
    username: 'username',
    email: 'username',
    text: 'username',
    password: 'password',
    otp: 'otp',
  }

  // Detect input fields and request matching entries
  async function scanAndRequest() {
    detectedFields = detectInputFields()

    console.log('[haex-pass] Scanning page:', window.location.href)
    console.log('[haex-pass] Detected fields:', detectedFields.length, detectedFields.map(f => ({ type: f.type, identifier: f.identifier })))

    if (detectedFields.length === 0) {
      console.log('[haex-pass] No input fields detected')
      return
    }

    const canonicalFields = [...new Set(
      detectedFields
        .map(f => fieldTypeToCanonical[f.type])
        .filter((f): f is string => f !== undefined),
    )]

    if (canonicalFields.length === 0) {
      console.log('[haex-pass] No canonical fields to query')
      return
    }

    // Request matching entries from background script
    try {
      console.log('[haex-pass] Requesting items for URL:', window.location.href)

      const response = await sendMessage('get-items', {
        url: window.location.href,
        fields: canonicalFields,
      }, 'background')

      if (response && (response as { success: boolean }).success) {
        matchingEntries = parseItemEntries((response as { data?: unknown }).data)
        console.log('[haex-pass] Matching entries:', matchingEntries.length)

        // Inject icons if we have matches, otherwise show "Add new" button
        if (matchingEntries.length > 0) {
          injectIcons()
        } else {
          injectAddNewButton()
        }
      } else {
        console.log('[haex-pass] Request failed:', (response as { error?: string }).error)
      }
    }
    catch (err) {
      console.error('[haex-pass] Failed to get items:', err)
    }
  }

  async function fetchTotpCode(entryId: string): Promise<string | null> {
    try {
      const response = await sendMessage('get-totp', { entryId }, 'background') as { success?: boolean, data?: Partial<GetTotpResponseData> }
      return response?.success && typeof response.data?.code === 'string' ? response.data.code : null
    } catch (err) {
      console.error('[haex-pass] Failed to get the TOTP code:', err)
      return null
    }
  }

  async function fillEntry(entry: ItemEntry, selectedField: DetectedField) {
    const selectedForm = selectedField.element.form
    const fieldsToFill = selectedForm
      ? detectedFields.filter(field => field.element.form === selectedForm)
      : detectedFields
    const wantsCode = entry.hasTotp && fieldsToFill.some(field => isOtpField(field, entry.autofillAliases))
    const otpCode = wantsCode ? await fetchTotpCode(entry.id) : null
    fillAllFields(fieldsToFill, entry.fields, entry.autofillAliases, otpCode)
  }

  // Inject "Add new" button when no entries exist for this page
  function injectAddNewButton() {
    // Only inject for username/password fields (primary login fields)
    const primaryFields = detectedFields.filter((field) => {
      const identifier = field.identifier.toLowerCase()
      // Check if field matches username or password aliases
      for (const [key, aliases] of Object.entries(DEFAULT_ALIASES)) {
        if (key === 'otp') continue // Skip OTP for "Add new" button
        if (key === identifier || aliases.some(alias => alias.toLowerCase() === identifier)) {
          return true
        }
      }
      return false
    })

    if (primaryFields.length === 0) return

    // Only inject on first field to avoid multiple buttons
    attachFieldIcon(primaryFields[0], { addNew: true, onClick: icon => void openCreateEntryForm(icon) })
  }

  // Opens the popup on its "create entry" form
  async function openCreateEntryForm(icon: HTMLElement) {
    try {
      await browser.storage.local.set({ showCreateEntryForm: true })
      const response = await sendMessage('open-popup', {}, 'background')
      if (!(response as { success: boolean }).success)
        showAddNewTooltip(icon)
    } catch {
      // Fallback: show a tooltip suggesting to click the extension icon
      showAddNewTooltip(icon)
    }
  }

  // Show tooltip when popup can't be opened programmatically
  function showAddNewTooltip(anchorEl: HTMLElement) {
    const tooltip = document.createElement('div')
    tooltip.className = 'haex-pass-tooltip'
    tooltip.textContent = 'Click the HaexPass icon in your browser toolbar to add a new entry'
    tooltip.style.cssText = `
      position: fixed;
      background: #1f2937;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      max-width: 250px;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `

    document.body.appendChild(tooltip)

    const anchorRect = anchorEl.getBoundingClientRect()
    tooltip.style.left = `${Math.max(8, anchorRect.left - tooltip.offsetWidth / 2 + anchorRect.width / 2)}px`
    tooltip.style.top = `${anchorRect.bottom + 8}px`

    // Remove after 3 seconds
    setTimeout(() => {
      tooltip.style.opacity = '0'
      tooltip.style.transition = 'opacity 0.2s'
      setTimeout(() => tooltip.remove(), 200)
    }, 3000)
  }

  // Inject haex-pass icons into input fields
  function injectIcons() {
    for (const field of detectedFields) {
      if (!shouldShowIconForField(field, matchingEntries))
        continue
      attachFieldIcon(field, {
        onClick: icon => showEntryDropdown(field.id, icon, matchingEntries, shadowDOM, entry => void fillEntry(entry, field)),
      })
    }
  }

  // Initial scan after DOM is ready
  if (document.readyState === 'complete') {
    scanAndRequest()
  }
  else {
    window.addEventListener('load', () => scanAndRequest())
  }

  // Also scan when DOM changes (for SPAs)
  const observer = new MutationObserver(() => {
    // Debounce
    clearTimeout((window as unknown as { __haexScanTimeout: ReturnType<typeof setTimeout> }).__haexScanTimeout)
    ;(window as unknown as { __haexScanTimeout: ReturnType<typeof setTimeout> }).__haexScanTimeout = setTimeout(() => {
      const newFields = detectInputFields()
      if (newFields.length !== detectedFields.length
        || newFields.some((field, index) => field.element !== detectedFields[index]?.element)) {
        scanAndRequest()
      }
    }, 500)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
})()
