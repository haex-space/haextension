import type { DetectedField } from './detector'

// Default aliases for standard fields (used when no custom aliases are set)
// Fields with default aliases always show the icon
export const DEFAULT_ALIASES: Record<string, string[]> = {
  username: ['email', 'login', 'user', 'e-mail', 'mail'],
  password: ['pass', 'pwd', 'secret'],
  otpSecret: ['otp', 'totp', '2fa', 'code', 'token'],
}

// Check if a field should show the icon
export function shouldShowIconForField(field: DetectedField, matchingEntries: unknown[]): boolean {
  const identifier = field.identifier.toLowerCase()

  // Always show for fields that match default alias keys or their aliases
  for (const [key, aliases] of Object.entries(DEFAULT_ALIASES)) {
    if (key === identifier || aliases.some(alias => alias.toLowerCase() === identifier)) {
      return true
    }
  }

  // For other fields, check if any entry has a matching value
  for (const entry of matchingEntries) {
    const e = entry as { fields: Record<string, string>, autofillAliases?: Record<string, string[]> | null }

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

// Fill a single field
export function fillField(fieldId: string, value: string) {
  const input = document.querySelector(`[data-haex-field-id="${fieldId}"]`) as HTMLInputElement
  if (input) {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

// Fill all fields with entry data, using aliases for matching
export function fillAllFields(
  detectedFields: DetectedField[],
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
