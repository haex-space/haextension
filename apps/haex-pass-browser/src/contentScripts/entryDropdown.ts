// Show dropdown with matching entries
export function showEntryDropdown(
  fieldId: string,
  anchorEl: HTMLElement,
  matchingEntries: unknown[],
  onSelect: (fields: Record<string, string>, autofillAliases?: Record<string, string[]> | null) => void,
) {
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
        onSelect(e.fields, e.autofillAliases)
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
