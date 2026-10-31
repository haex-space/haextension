import type { DetectedField } from './detector'
import type { ItemEntry } from '~/logic/haexPassApi'

// Default aliases for standard fields (used when no custom aliases are set)
// Fields with default aliases always show the icon
export const DEFAULT_ALIASES: Record<string, string[]> = {
  username: ['email', 'login', 'user', 'e-mail', 'mail'],
  password: ['pass', 'pwd', 'secret'],
  otp: ['otp', 'totp', '2fa', 'code', 'token'],
}

// Check if a field should show the icon
export function shouldShowIconForField(field: DetectedField, matchingEntries: ItemEntry[]): boolean {
  // A one-time-code field ("app_otp", "user[otp_attempt]") only needs an entry with a TOTP
  if (isOtpField(field, null) || matchingEntries.some(e => isOtpField(field, e.autofillAliases)))
    return matchingEntries.some(e => e.hasTotp)

  const identifier = field.identifier.toLowerCase()

  // Always show for fields that match default alias keys or their aliases
  for (const [key, aliases] of Object.entries(DEFAULT_ALIASES)) {
    if (key === identifier || aliases.some(alias => alias.toLowerCase() === identifier)) {
      return true
    }
  }

  // For other fields, check if any entry has a matching value
  for (const e of matchingEntries) {
    // Check exact match
    if (e.fields[field.identifier]) {
      return true
    }

    // Check custom aliases from entry
    for (const [fieldKey, fieldValue] of Object.entries(e.fields)) {
      if (!fieldValue) continue
      const aliases = e.autofillAliases?.[fieldKey] ?? []
      if (aliases.some(alias => alias.toLowerCase() === identifier)) {
        return true
      }
    }
  }

  return false
}

function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Types the code into the input; when the input takes fewer characters than
 * the code (one box per digit), the rest goes into the following boxes of the
 * same size, found in the nearest ancestor that holds enough of them.
 */
function fillOtpCode(input: HTMLInputElement, code: string, filled: Set<HTMLInputElement>) {
  const size = input.maxLength
  if (size <= 0 || size >= code.length) {
    setInputValue(input, code)
    filled.add(input)
    return
  }
  const needed = Math.ceil(code.length / size)
  let scope = input.parentElement
  let boxes: HTMLInputElement[] = []
  for (let depth = 0; scope && depth < 5; depth++, scope = scope.parentElement) {
    const all = Array.from(scope.querySelectorAll<HTMLInputElement>('input')).filter(box => box.maxLength === size)
    boxes = all.slice(all.indexOf(input))
    if (boxes.length >= needed)
      break
  }
  boxes.slice(0, needed).forEach((box, index) => {
    setInputValue(box, code.slice(index * size, (index + 1) * size))
    filled.add(box)
  })
}

/** A field for a one-time code; it is only ever filled with a code from get-totp. */
export function isOtpField(field: DetectedField, autofillAliases?: Record<string, string[]> | null): boolean {
  if (field.type === 'otp')
    return true
  const identifier = field.identifier.toLowerCase()
  const aliases = autofillAliases?.otp ?? DEFAULT_ALIASES.otp
  return identifier === 'otp' || aliases.some(alias => alias.toLowerCase() === identifier)
}

// Fill all fields with entry data, using aliases for matching
export function fillAllFields(
  detectedFields: DetectedField[],
  entryFields: Record<string, string>,
  autofillAliases?: Record<string, string[]> | null,
  otpCode?: string | null,
) {
  // `otp` is the vault's "TOTP" marker, never a value to type.
  const fields = { ...entryFields }
  delete fields.otp
  // Boxes of a code split over several inputs are filled together, once
  const otpFilled = new Set<HTMLInputElement>()

  detectedFields.forEach((field) => {
    // First try exact match with field identifier
    let value = fields[field.identifier]

    if (!value && isOtpField(field, autofillAliases)) {
      if (otpCode && !otpFilled.has(field.element))
        fillOtpCode(field.element, otpCode, otpFilled)
      return
    }

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

    // The detected element itself: the data-haex-field-id marker exists only
    // on inputs that got an icon, and every rescan hands out new field ids.
    if (value)
      setInputValue(field.element, value)
  })
}
