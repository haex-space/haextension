/* eslint-disable no-console */
import { onMessage, sendMessage } from 'webext-bridge/content-script'
import { createApp } from 'vue'
import App from './views/App.vue'
import { setupApp } from '~/logic/common-setup'
import { detectInputFields, type DetectedField } from './detector'

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
;(() => {
  console.info('[haex-pass] Content script loaded')

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
    fillAllFields: (entry: EntryWithAliases) => fillAllFields(entry.fields, entry.autofillAliases),
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

    // Request matching entries from background script
    try {
      console.log('[haex-pass] Requesting items for URL:', window.location.href)
      const response = await sendMessage('get-items', {
        url: window.location.href,
        fields: detectedFields.map(f => f.identifier),
      }, 'background')

      console.log('[haex-pass] Response from background:', response)

      if (response && (response as { success: boolean }).success) {
        // Response structure: { success: true, data: { success: true, data: { entries: [...] } } }
        // The outer wrapper is from main.ts, the inner is from haex-pass
        const innerData = (response as { data: { data?: { entries?: unknown[] } } }).data
        matchingEntries = innerData?.data?.entries || []
        console.log('[haex-pass] Matching entries:', matchingEntries.length, matchingEntries)

        // Inject icons if we have matches
        if (matchingEntries.length > 0) {
          injectIcons()
        }
      } else {
        console.log('[haex-pass] Request failed:', (response as { error?: string }).error)
      }
    }
    catch (err) {
      console.error('[haex-pass] Failed to get items:', err)
    }
  }

  // Inject haex-pass icons into input fields
  function injectIcons() {
    detectedFields.forEach((field) => {
      const input = document.querySelector(`[data-haex-field-id="${field.id}"]`) as HTMLInputElement
        || document.getElementById(field.element.id)
        || document.querySelector(`[name="${field.element.name}"]`)

      if (!input || input.dataset.haexInjected)
        return

      input.dataset.haexInjected = 'true'
      input.dataset.haexFieldId = field.id

      // Create icon container with haex-pass logo
      const iconContainer = document.createElement('div')
      iconContainer.className = 'haex-pass-icon'
      iconContainer.dataset.fieldId = field.id

      const logoImg = document.createElement('img')
      logoImg.src = browser.runtime.getURL('assets/haex-pass-logo.png')
      logoImg.alt = 'haex-pass'
      logoImg.style.cssText = 'width: 18px; height: 18px; object-fit: contain;'
      iconContainer.appendChild(logoImg)

      // Position the icon inside the input
      const inputRect = input.getBoundingClientRect()
      const inputStyles = window.getComputedStyle(input)

      iconContainer.style.cssText = `
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        cursor: pointer;
        color: #666;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
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
      input.style.paddingRight = '32px'

      // Click handler to show dropdown
      iconContainer.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        showEntryDropdown(field.id, iconContainer)
      })

      // Hover effects
      iconContainer.addEventListener('mouseenter', () => {
        iconContainer.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'
        iconContainer.style.transform = 'translateY(-50%) scale(1.1)'
      })
      iconContainer.addEventListener('mouseleave', () => {
        iconContainer.style.backgroundColor = 'transparent'
        iconContainer.style.transform = 'translateY(-50%) scale(1)'
      })
    })
  }

  // Show dropdown with matching entries
  function showEntryDropdown(fieldId: string, anchorEl: HTMLElement) {
    // Remove existing dropdown
    document.querySelectorAll('.haex-pass-dropdown').forEach(el => el.remove())

    const dropdown = document.createElement('div')
    dropdown.className = 'haex-pass-dropdown'

    // Initial styles (position will be adjusted after measuring)
    dropdown.style.cssText = `
      position: fixed;
      min-width: 280px;
      max-width: 350px;
      max-height: 300px;
      overflow-y: auto;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.15s ease;
    `

    if (matchingEntries.length === 0) {
      const emptyMsg = document.createElement('div')
      emptyMsg.style.cssText = 'padding: 12px; color: #6b7280; font-size: 14px;'
      emptyMsg.textContent = 'No matching entries found'
      dropdown.appendChild(emptyMsg)
    }
    else {
      matchingEntries.forEach((entry: unknown, index: number) => {
        const e = entry as { id: string, title: string, fields: Record<string, string>, autofillAliases?: Record<string, string[]> | null }
        const item = document.createElement('div')
        item.style.cssText = `
          padding: 10px 12px;
          cursor: pointer;
          border-bottom: ${index < matchingEntries.length - 1 ? '1px solid #f3f4f6' : 'none'};
          transition: background 0.15s;
        `

        const titleDiv = document.createElement('div')
        titleDiv.style.cssText = 'font-weight: 500; font-size: 14px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
        titleDiv.textContent = e.title

        const usernameDiv = document.createElement('div')
        usernameDiv.style.cssText = 'font-size: 12px; color: #6b7280; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
        usernameDiv.textContent = e.fields.username || e.fields.email || 'No username'

        item.appendChild(titleDiv)
        item.appendChild(usernameDiv)

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = '#f3f4f6'
        })
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent'
        })

        item.addEventListener('click', () => {
          fillAllFields(e.fields, e.autofillAliases)
          dropdown.remove()
        })

        dropdown.appendChild(item)
      })
    }

    // Append to body for fixed positioning
    document.body.appendChild(dropdown)

    // Calculate optimal position
    const anchorRect = anchorEl.getBoundingClientRect()
    const dropdownRect = dropdown.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const padding = 8 // Minimum padding from viewport edges

    // Calculate horizontal position
    let left = anchorRect.right - dropdownRect.width // Align right edge with icon
    if (left < padding) {
      // Would overflow left - align to left edge of viewport
      left = padding
    }
    if (left + dropdownRect.width > viewportWidth - padding) {
      // Would overflow right - align to right edge of viewport
      left = viewportWidth - dropdownRect.width - padding
    }

    // Calculate vertical position
    let top = anchorRect.bottom + 4 // Below the icon
    const spaceBelow = viewportHeight - anchorRect.bottom - padding
    const spaceAbove = anchorRect.top - padding

    if (dropdownRect.height > spaceBelow && spaceAbove > spaceBelow) {
      // Not enough space below, but more space above - show above
      top = anchorRect.top - dropdownRect.height - 4
    }

    // Constrain max-height if needed
    const availableHeight = Math.max(spaceBelow, spaceAbove) - 8
    if (availableHeight < 300) {
      dropdown.style.maxHeight = `${Math.max(150, availableHeight)}px`
    }

    // Apply final position
    dropdown.style.left = `${Math.max(padding, left)}px`
    dropdown.style.top = `${Math.max(padding, top)}px`

    // Fade in
    requestAnimationFrame(() => {
      dropdown.style.opacity = '1'
    })

    // Close on click outside
    const closeHandler = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node) && e.target !== anchorEl) {
        dropdown.style.opacity = '0'
        setTimeout(() => dropdown.remove(), 150)
        document.removeEventListener('click', closeHandler)
      }
    }
    setTimeout(() => document.addEventListener('click', closeHandler), 0)

    // Close on scroll outside dropdown (the dropdown position would be stale)
    const scrollHandler = (e: Event) => {
      // Ignore scroll events from within the dropdown itself
      if (dropdown.contains(e.target as Node)) {
        return
      }
      dropdown.style.opacity = '0'
      setTimeout(() => dropdown.remove(), 150)
      window.removeEventListener('scroll', scrollHandler, true)
      document.removeEventListener('click', closeHandler)
    }
    window.addEventListener('scroll', scrollHandler, true)

    // Close on Escape key
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dropdown.style.opacity = '0'
        setTimeout(() => dropdown.remove(), 150)
        document.removeEventListener('keydown', keyHandler)
        document.removeEventListener('click', closeHandler)
      }
    }
    document.addEventListener('keydown', keyHandler)
  }

  // Fill a single field
  function fillField(fieldId: string, value: string) {
    const input = document.querySelector(`[data-haex-field-id="${fieldId}"]`) as HTMLInputElement
    if (input) {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  // Default aliases for standard fields (used when no custom aliases are set)
  const DEFAULT_ALIASES: Record<string, string[]> = {
    username: ['email', 'login', 'user', 'e-mail', 'mail'],
    password: ['pass', 'pwd', 'secret'],
    otpSecret: ['otp', 'totp', '2fa', 'code', 'token'],
  }

  // Fill all fields with entry data, using aliases for matching
  function fillAllFields(
    fields: Record<string, string>,
    autofillAliases?: Record<string, string[]> | null,
  ) {
    detectedFields.forEach((field) => {
      // First try exact match with field identifier
      let value = fields[field.identifier]

      // If no exact match, try reverse alias lookup
      // For each field in the entry, check if the form field identifier matches one of its aliases
      if (!value) {
        for (const [fieldKey, fieldValue] of Object.entries(fields)) {
          // Get aliases for this field (custom > default)
          const aliases = autofillAliases?.[fieldKey] ?? DEFAULT_ALIASES[fieldKey] ?? []
          const identifier = field.identifier.toLowerCase()

          // Check if the form field identifier matches any alias
          if (aliases.some(alias => alias.toLowerCase() === identifier)) {
            value = fieldValue
            break
          }
        }
      }

      // Also try matching by field type (e.g., email field could use username value)
      if (!value && (field.type === 'email' || field.type === 'username')) {
        value = fields.username || fields.email || fields.login || fields.user
      }
      if (!value && field.type === 'password') {
        value = fields.password || fields.pass || fields.pwd
      }

      if (value) {
        fillField(field.id, value)
      }
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
