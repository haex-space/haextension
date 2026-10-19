import type { DetectedField } from './detector'

const BADGE_STYLE = `
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

/**
 * Puts the haex-pass icon at the right edge of a detected input (wrapping the
 * input for that) and marks the input as done. `addNew` adds the "+" badge.
 * `onClick` runs only for real user clicks: the icon lives in the page's DOM,
 * where page scripts can click it too. Does nothing for an input that is gone
 * or already has an icon.
 */
export function attachFieldIcon(field: DetectedField, options: { addNew?: boolean, onClick: (icon: HTMLElement) => void }): void {
  const input = field.element
  if (!input.isConnected || input.dataset.haexInjected)
    return

  input.dataset.haexInjected = 'true'
  input.dataset.haexFieldId = field.id

  const icon = document.createElement('div')
  icon.className = options.addNew ? 'haex-pass-icon haex-pass-add-new' : 'haex-pass-icon'
  icon.dataset.fieldId = field.id

  const logoImg = document.createElement('img')
  logoImg.src = browser.runtime.getURL('assets/haex-pass-logo.png')
  logoImg.alt = 'HaexPass'
  logoImg.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;'
  icon.appendChild(logoImg)

  if (options.addNew) {
    const badge = document.createElement('div')
    badge.textContent = '+'
    badge.style.cssText = BADGE_STYLE
    icon.appendChild(badge)
  }

  // Position the icon inside the input - full height, square
  const inputStyles = window.getComputedStyle(input)
  const inputHeight = input.offsetHeight

  icon.style.cssText = `
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

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `
    position: relative;
    display: inline-block;
    width: ${inputStyles.width};
  `

  input.parentNode?.insertBefore(wrapper, input)
  wrapper.appendChild(input)
  wrapper.appendChild(icon)

  // Room for the icon
  input.style.paddingRight = `${inputHeight + 4}px`

  icon.addEventListener('click', (e) => {
    if (!e.isTrusted)
      return
    e.preventDefault()
    e.stopPropagation()
    options.onClick(icon)
  })

  icon.addEventListener('mouseenter', () => {
    icon.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'
    icon.style.transform = 'scale(1.05)'
  })
  icon.addEventListener('mouseleave', () => {
    icon.style.backgroundColor = 'transparent'
    icon.style.transform = 'scale(1)'
  })
}
