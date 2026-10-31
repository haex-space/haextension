/**
 * Input field detector for haex-pass browser extension
 * Detects login forms and extracts field identifiers
 */

export interface DetectedField {
  id: string // Unique ID for this field instance
  element: HTMLInputElement
  type: 'username' | 'password' | 'email' | 'otp' | 'text'
  identifier: string // The name/id we'll use to match with haex-pass entries
}

// Common field name patterns
const USERNAME_PATTERNS = [
  /user/i, /login/i, /email/i, /username/i, /account/i, /nick/i, /handle/i,
]

const PASSWORD_PATTERNS = [
  /pass/i, /pwd/i, /secret/i,
]

const OTP_PATTERNS = [
  /otp/i, /totp/i, /code/i, /token/i, /2fa/i, /mfa/i, /verification/i,
]

const EMAIL_PATTERNS = [
  /email/i, /mail/i,
]

// Site search boxes ("Search models, datasets, users...") are never login fields
const SEARCH_PATTERNS = [/\bsearch\b/i, /\bsuche\b/i, /\bquery\b/i]

let fieldCounter = 0

function generateFieldId(): string {
  return `haex-field-${Date.now()}-${++fieldCounter}`
}

function getFieldType(input: HTMLInputElement): DetectedField['type'] {
  const type = input.type.toLowerCase()
  const name = (input.name || '').toLowerCase()
  const id = (input.id || '').toLowerCase()
  const autocomplete = (input.autocomplete || '').toLowerCase()
  const placeholder = (input.placeholder || '').toLowerCase()

  // Check input type first
  if (type === 'password')
    return 'password'
  if (type === 'email')
    return 'email'

  // Check autocomplete attribute
  if (autocomplete.includes('password') || autocomplete === 'current-password' || autocomplete === 'new-password') {
    return 'password'
  }
  if (autocomplete.includes('email')) {
    return 'email'
  }
  if (autocomplete.includes('username') || autocomplete === 'username') {
    return 'username'
  }
  if (autocomplete.includes('one-time-code')) {
    return 'otp'
  }

  // Check name/id/placeholder patterns
  const allText = `${name} ${id} ${placeholder}`

  if (PASSWORD_PATTERNS.some(p => p.test(allText)))
    return 'password'
  if (OTP_PATTERNS.some(p => p.test(allText)))
    return 'otp'
  if (EMAIL_PATTERNS.some(p => p.test(allText)))
    return 'email'
  if (USERNAME_PATTERNS.some(p => p.test(allText)))
    return 'username'

  return 'text'
}

function getFieldIdentifier(input: HTMLInputElement): string {
  // Priority: name > id > autocomplete > type
  if (input.name)
    return input.name
  if (input.id)
    return input.id
  if (input.autocomplete && input.autocomplete !== 'off')
    return input.autocomplete

  // Fallback to type-based identifier
  const type = getFieldType(input)
  return type
}

function isVisibleInput(input: HTMLInputElement): boolean {
  // Check if element is visible
  const style = window.getComputedStyle(input)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }

  // Check dimensions
  const rect = input.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    return false
  }

  // Check if it's a hidden input
  if (input.type === 'hidden') {
    return false
  }

  return true
}

function isSearchField(input: HTMLInputElement): boolean {
  if (input.getAttribute('role') === 'searchbox' || input.closest('search, [role="search"]'))
    return true
  const text = `${input.name || ''} ${input.id || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`
  return SEARCH_PATTERNS.some(p => p.test(text))
}

function isLoginField(input: HTMLInputElement): boolean {
  const type = input.type.toLowerCase()

  // Only consider text, email, password, and tel inputs
  if (!['text', 'email', 'password', 'tel', 'number'].includes(type)) {
    return false
  }

  // Check if it's visible
  if (!isVisibleInput(input)) {
    return false
  }

  if (type !== 'password' && isSearchField(input)) {
    return false
  }

  // Check if it looks like a login field
  const fieldType = getFieldType(input)
  return fieldType !== 'text' || hasLoginFormContext(input)
}

function hasLoginFormContext(input: HTMLInputElement): boolean {
  // Check if the input is in a form that looks like a login form
  const form = input.closest('form')
  if (form) {
    const formText = `${form.action || ''} ${form.id || ''} ${form.className || ''}`.toLowerCase()
    if (/login|signin|auth|account/i.test(formText)) {
      return true
    }

    // Check if form has password field
    if (form.querySelector('input[type="password"]')) {
      return true
    }
  }

  // Check parent containers for login context
  let parent = input.parentElement
  let depth = 0
  while (parent && depth < 5) {
    const parentText = `${parent.id || ''} ${parent.className || ''}`.toLowerCase()
    if (/login|signin|auth|account|credential/i.test(parentText)) {
      return true
    }
    parent = parent.parentElement
    depth++
  }

  return false
}

export function detectInputFields(): DetectedField[] {
  const inputs = document.querySelectorAll<HTMLInputElement>('input')
  const fields: DetectedField[] = []

  // Every input is its own field, even when identifiers repeat: fields
  // without name/id fall back to their type, so a stray "username" field
  // must not push the real one out.
  inputs.forEach((input) => {
    if (!isLoginField(input))
      return

    const field: DetectedField = {
      id: generateFieldId(),
      element: input,
      type: getFieldType(input),
      identifier: getFieldIdentifier(input),
    }

    fields.push(field)
  })

  return fields
}
