/* eslint-disable no-console */
import { onMessage, sendMessage } from 'webext-bridge/content-script'
import { createApp } from 'vue'
import App from './views/App.vue'
import { setupApp } from '~/logic/common-setup'
import { DEFAULT_ALIASES, fillAllFields, fillField, shouldShowIconForField } from './autofill'
import { detectInputFields, type DetectedField } from './detector'
import { showEntryDropdown } from './entryDropdown'
import { initWebAuthnBridge } from './webauthn-bridge'

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
;(() => {
  console.info('[haex-pass] Content script loaded')

  // Initialize WebAuthn bridge for passkey support
  initWebAuthnBridge()

  // State
  let detectedFields: DetectedField[] = []
  let matchingEntries: unknown[] = []

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
  setupApp(app)
  const vm = app.mount(root)

  // Entry type from haex-pass API
  interface EntryWithAliases {
    fields: Record<string, string>
    autofillAliases?: Record<string, string[]> | null
  }

  // Expose state to Vue app
  ;(window as unknown as { __haexPass: unknown }).__haexPass = {
    getFields: () => detectedFields,
    getEntries: () => matchingEntries,
    fillField: (fieldId: string, value: string) => fillField(fieldId, value),
    fillAllFields: (entry: EntryWithAliases) => fillAllFields(detectedFields, entry.fields, entry.autofillAliases),
  }

  // Maps detected field types to canonical vault field keys.
  // 'text' fields pass isLoginField only when inside a login form context,
  // so they are treated as username candidates.
  const fieldTypeToCanonical: Record<string, string> = {
    username: 'username',
    email: 'username',
    text: 'username',
    password: 'password',
    otp: 'otpSecret',
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

      console.log('[haex-pass] Response from background:', response)

      if (response && (response as { success: boolean }).success) {
        // Response structure: { success: true, data: { success: true, data: { entries: [...] } } }
        // The outer wrapper is from main.ts, the inner is from haex-pass
        const innerData = (response as { data: { data?: { entries?: unknown[] } } }).data
        matchingEntries = innerData?.data?.entries || []
        console.log('[haex-pass] Matching entries:', matchingEntries.length, matchingEntries)

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

  // Inject "Add new" button when no entries exist for this page
  function injectAddNewButton() {
    // Only inject for username/password fields (primary login fields)
    const primaryFields = detectedFields.filter((field) => {
      const identifier = field.identifier.toLowerCase()
      // Check if field matches username or password aliases
      for (const [key, aliases] of Object.entries(DEFAULT_ALIASES)) {
        if (key === 'otpSecret') continue // Skip OTP for "Add new" button
        if (key === identifier || aliases.some(alias => alias.toLowerCase() === identifier)) {
          return true
        }
      }
      return false
    })

    if (primaryFields.length === 0) return

    // Only inject on first field to avoid multiple buttons
    const field = primaryFields[0]
    const input = document.querySelector(`[data-haex-field-id="${field.id}"]`) as HTMLInputElement
      || document.getElementById(field.element.id)
      || document.querySelector(`[name="${field.element.name}"]`)

    if (!input || input.dataset.haexInjected) return

    input.dataset.haexInjected = 'true'
    input.dataset.haexFieldId = field.id

    // Create icon container with haex-pass logo and + badge
    const iconContainer = document.createElement('div')
    iconContainer.className = 'haex-pass-icon haex-pass-add-new'
    iconContainer.dataset.fieldId = field.id

    const logoImg = document.createElement('img')
    logoImg.src = browser.runtime.getURL('assets/haex-pass-logo.png')
    logoImg.alt = 'HaexPass'
    logoImg.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;'
    iconContainer.appendChild(logoImg)

    // Add a small + badge
    const badge = document.createElement('div')
    badge.textContent = '+'
    badge.style.cssText = `
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 14px;
      height: 14px;
      background: #10b981;
      color: white;
      border-radius: 50%;
      font-size: 12px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    `
    iconContainer.appendChild(badge)

    // Position the icon inside the input - full height, square
    const inputStyles = window.getComputedStyle(input)
    const inputHeight = input.offsetHeight

    iconContainer.style.cssText = `
      position: absolute;
      right: 8px;
      top: 8px;
      width: ${inputHeight - 16}px;
      height: ${inputHeight - 16}px;
      cursor: pointer;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      transition: all 0.2s;
    `

    // Wrap input if needed
    const wrapper = document.createElement('div')
    wrapper.style.cssText = `
      position: relative;
      display: inline-block;
      width: ${inputStyles.width};
    `

    input.parentNode?.insertBefore(wrapper, input)
    wrapper.appendChild(input)
    wrapper.appendChild(iconContainer)

    // Add padding to input to make room for icon
    input.style.paddingRight = `${inputHeight + 4}px`

    // Click handler to open popup with CreateEntryForm
    iconContainer.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()

      // Set flag in storage to show CreateEntryForm when popup opens
      await browser.storage.local.set({ showCreateEntryForm: true })

      // Request background script to open popup
      try {
        const response = await sendMessage('open-popup', {}, 'background')
        if (!(response as { success: boolean }).success) {
          showAddNewTooltip(iconContainer)
        }
      } catch {
        // Fallback: show a tooltip suggesting to click the extension icon
        showAddNewTooltip(iconContainer)
      }
    })

    // Hover effects
    iconContainer.addEventListener('mouseenter', () => {
      iconContainer.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'
      iconContainer.style.transform = 'scale(1.05)'
    })
    iconContainer.addEventListener('mouseleave', () => {
      iconContainer.style.backgroundColor = 'transparent'
      iconContainer.style.transform = 'scale(1)'
    })
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
    detectedFields.forEach((field) => {
      const input = document.querySelector(`[data-haex-field-id="${field.id}"]`) as HTMLInputElement
        || document.getElementById(field.element.id)
        || document.querySelector(`[name="${field.element.name}"]`)

      if (!input || input.dataset.haexInjected)
        return

      // Check if we should show icon for this field
      if (!shouldShowIconForField(field, matchingEntries))
        return

      input.dataset.haexInjected = 'true'
      input.dataset.haexFieldId = field.id

      // Create icon container with haex-pass logo
      const iconContainer = document.createElement('div')
      iconContainer.className = 'haex-pass-icon'
      iconContainer.dataset.fieldId = field.id

      const logoImg = document.createElement('img')
      logoImg.src = browser.runtime.getURL('assets/haex-pass-logo.png')
      logoImg.alt = 'HaexPass'
      logoImg.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;'
      iconContainer.appendChild(logoImg)

      // Position the icon inside the input - full height, square
      const inputStyles = window.getComputedStyle(input)
      const inputHeight = input.offsetHeight

      iconContainer.style.cssText = `
        position: absolute;
        right: 8px;
        top: 8px;
        width: ${inputHeight - 16}px;
        height: ${inputHeight - 16}px;
        cursor: pointer;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        transition: all 0.2s;
      `

      // Wrap input if needed
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        width: ${inputStyles.width};
      `

      input.parentNode?.insertBefore(wrapper, input)
      wrapper.appendChild(input)
      wrapper.appendChild(iconContainer)

      // Add padding to input to make room for icon
      input.style.paddingRight = `${inputHeight + 4}px`

      // Click handler to show dropdown
      iconContainer.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        showEntryDropdown(field.id, iconContainer, matchingEntries, (fields, autofillAliases) => fillAllFields(detectedFields, fields, autofillAliases))
      })

      // Hover effects
      iconContainer.addEventListener('mouseenter', () => {
        iconContainer.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'
        iconContainer.style.transform = 'scale(1.05)'
      })
      iconContainer.addEventListener('mouseleave', () => {
        iconContainer.style.backgroundColor = 'transparent'
        iconContainer.style.transform = 'scale(1)'
      })
    })
  }

  // Listen for messages from background
  onMessage('page-loaded', () => {
    console.log('[haex-pass] Page loaded, scanning for fields')
    scanAndRequest()
  })

  onMessage('fill-field', ({ data }) => {
    const { fieldId, value } = data as { fieldId: string, value: string }
    fillField(fieldId, value)
  })

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
      if (newFields.length !== detectedFields.length) {
        scanAndRequest()
      }
    }, 500)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
})()
