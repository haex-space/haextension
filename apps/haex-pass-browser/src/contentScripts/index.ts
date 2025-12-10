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

  // Expose state to Vue app
  ;(window as unknown as { __haexPass: unknown }).__haexPass = {
    getFields: () => detectedFields,
    getEntries: () => matchingEntries,
    fillField: (fieldId: string, value: string) => fillField(fieldId, value),
    fillAllFields: (entry: Record<string, string>) => fillAllFields(entry),
  }

  // Detect input fields and request matching entries
  async function scanAndRequest() {
    detectedFields = detectInputFields()

    if (detectedFields.length === 0) {
      console.log('[haex-pass] No input fields detected')
      return
    }

    console.log('[haex-pass] Detected fields:', detectedFields.map(f => f.identifier))

    // Request matching entries from background script
    try {
      const response = await sendMessage('get-logins', {
        url: window.location.href,
        fields: detectedFields.map(f => f.identifier),
      }, 'background')

      if (response && (response as { success: boolean }).success) {
        matchingEntries = (response as { data: { entries: unknown[] } }).data?.entries || []
        console.log('[haex-pass] Matching entries:', matchingEntries.length)

        // Inject icons if we have matches
        if (matchingEntries.length > 0) {
          injectIcons()
        }
      }
    }
    catch (err) {
      console.error('[haex-pass] Failed to get logins:', err)
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

      // Create icon container
      const iconContainer = document.createElement('div')
      iconContainer.className = 'haex-pass-icon'
      iconContainer.dataset.fieldId = field.id
      iconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      `

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
        iconContainer.style.color = '#10b981'
        iconContainer.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'
      })
      iconContainer.addEventListener('mouseleave', () => {
        iconContainer.style.color = '#666'
        iconContainer.style.backgroundColor = 'transparent'
      })
    })
  }

  // Show dropdown with matching entries
  function showEntryDropdown(fieldId: string, anchorEl: HTMLElement) {
    // Remove existing dropdown
    document.querySelectorAll('.haex-pass-dropdown').forEach(el => el.remove())

    const dropdown = document.createElement('div')
    dropdown.className = 'haex-pass-dropdown'
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      min-width: 250px;
      max-height: 300px;
      overflow-y: auto;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      z-index: 10001;
    `

    if (matchingEntries.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 12px; color: #6b7280; font-size: 14px;">
          No matching entries found
        </div>
      `
    }
    else {
      matchingEntries.forEach((entry: unknown) => {
        const e = entry as { id: string, title: string, fields: Record<string, string> }
        const item = document.createElement('div')
        item.style.cssText = `
          padding: 10px 12px;
          cursor: pointer;
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.15s;
        `
        item.innerHTML = `
          <div style="font-weight: 500; font-size: 14px; color: #111827;">${e.title}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">
            ${e.fields.username || e.fields.email || 'No username'}
          </div>
        `

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = '#f9fafb'
        })
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent'
        })

        item.addEventListener('click', () => {
          fillAllFields(e.fields)
          dropdown.remove()
        })

        dropdown.appendChild(item)
      })
    }

    anchorEl.parentElement?.appendChild(dropdown)

    // Close on click outside
    const closeHandler = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node) && e.target !== anchorEl) {
        dropdown.remove()
        document.removeEventListener('click', closeHandler)
      }
    }
    setTimeout(() => document.addEventListener('click', closeHandler), 0)
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

  // Fill all fields with entry data
  function fillAllFields(fields: Record<string, string>) {
    detectedFields.forEach((field) => {
      const value = fields[field.identifier]
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
