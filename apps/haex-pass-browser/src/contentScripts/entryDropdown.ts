import type { ItemEntry } from '~/logic/haexPassApi'

// Closes the dropdown on screen, if any, together with its listeners.
let closeOpenDropdown: (() => void) | null = null

// Show dropdown with matching entries. It lives in the content script's
// shadow root (`overlayRoot`) so page scripts can neither read the entries
// nor click one.
export function showEntryDropdown(
  fieldId: string,
  anchorEl: HTMLElement,
  matchingEntries: ItemEntry[],
  overlayRoot: ShadowRoot | HTMLElement,
  onSelect: (entry: ItemEntry) => void,
) {
  // Clicks inside a shadow root reach document listeners retargeted to its host.
  const overlayHost = overlayRoot instanceof ShadowRoot ? overlayRoot.host : overlayRoot

  closeOpenDropdown?.()

  const dropdown = document.createElement('div')
  dropdown.className = 'haex-pass-dropdown'

  // Every way of closing goes through here, so no document or window
  // listener outlives the dropdown.
  const listeners = new AbortController()
  const close = () => {
    listeners.abort()
    dropdown.style.opacity = '0'
    setTimeout(() => dropdown.remove(), 150)
    if (closeOpenDropdown === close)
      closeOpenDropdown = null
  }
  closeOpenDropdown = close

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
    matchingEntries.forEach((e, index) => {
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

      item.addEventListener('click', (event) => {
        if (!event.isTrusted)
          return
        onSelect(e)
        close()
      })

      dropdown.appendChild(item)
    })
  }

  overlayRoot.appendChild(dropdown)

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

  const { signal } = listeners

  // Close on click outside
  setTimeout(() => document.addEventListener('click', (e) => {
    const target = e.target as Node
    if (!dropdown.contains(target) && target !== overlayHost && !anchorEl.contains(target))
      close()
  }, { signal }), 0)

  // Close on scroll outside dropdown (the dropdown position would be stale)
  window.addEventListener('scroll', (e) => {
    if (!dropdown.contains(e.target as Node))
      close()
  }, { capture: true, signal })

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape')
      close()
  }, { signal })
}
