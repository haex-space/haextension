import type { EntryKeys, FieldFacts } from '@haex-space/vault-sdk/autofill'
import type { DetectedField } from './detector'
import type { ItemEntry } from '~/logic/haexPassApi'
import { fieldKind, mapFields, isOtpField as ruleIsOtpField, showsIcon } from '@haex-space/vault-sdk/autofill'

/**
 * Autofill of haex-pass. Which page field gets which entry field decides the one implementation
 * of the rule, the crate `haex-autofill` of the vault-sdk (its WebAssembly build, which holzi's
 * agent browser uses natively): the entry's own aliases, the default aliases, the field kind and
 * the card fields (`autocomplete` `cc-*`). `initAutofill()` from the SDK must have finished first.
 */
export { initAutofill } from '@haex-space/vault-sdk/autofill'

/** What the rule knows of an input: never its value. */
export function factsOf(element: HTMLInputElement): FieldFacts {
  return {
    inputType: (element.getAttribute('type') || 'text').toLowerCase(),
    name: element.getAttribute('name') || '',
    id: element.id || '',
    autocomplete: element.getAttribute('autocomplete') || '',
    placeholder: element.getAttribute('placeholder') || '',
  }
}

/** The keys of an entry's fields that hold a value, its own aliases and its TOTP. */
function keysOf(fields: Record<string, string>, aliases: Record<string, string[]> | null | undefined, hasTotp: boolean): EntryKeys {
  return { keys: Object.keys(fields).filter(key => fields[key]), aliases: aliases ?? null, hasTotp }
}

/** Whether the field gets the icon for one of the entries that match the page. */
export function shouldShowIconForField(field: DetectedField, matchingEntries: ItemEntry[]): boolean {
  return showsIcon(
    factsOf(field.element),
    matchingEntries.map(entry => keysOf(entry.fields, entry.autofillAliases, entry.hasTotp)),
  )
}

/** A username, email or password field: where "Add new" offers to save a login. */
export function isLoginField(field: DetectedField): boolean {
  return ['username', 'email', 'password'].includes(fieldKind(factsOf(field.element)))
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
  return ruleIsOtpField(factsOf(field.element), autofillAliases)
}

/** Fills the detected fields with the entry's values as the rule maps them. */
export function fillAllFields(
  detectedFields: DetectedField[],
  entryFields: Record<string, string>,
  autofillAliases?: Record<string, string[]> | null,
  otpCode?: string | null,
) {
  const hasTotp = Boolean(otpCode) || Boolean(entryFields.otp)
  const targets = mapFields(
    detectedFields.map(field => factsOf(field.element)),
    keysOf(entryFields, autofillAliases, hasTotp),
  )
  // Boxes of a code split over several inputs are filled together, once
  const otpFilled = new Set<HTMLInputElement>()
  targets.forEach((target, index) => {
    const field = detectedFields[index]
    if (!target || !field)
      return
    if (target.kind === 'otp') {
      if (otpCode && !otpFilled.has(field.element))
        fillOtpCode(field.element, otpCode, otpFilled)
      return
    }
    // `otp` is the vault's "TOTP" marker, never a value to type.
    const value = target.key === 'otp' ? undefined : entryFields[target.key]
    // The detected element itself: the data-haex-field-id marker exists only
    // on inputs that got an icon, and every rescan hands out new field ids.
    if (value)
      setInputValue(field.element, value)
  })
}
