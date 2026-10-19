import type { DetectedField } from '../detector'
import { afterEach, describe, expect, it } from 'vitest'
import { fillAllFields } from '../autofill'

function input(attributes: Record<string, string>): HTMLInputElement {
  const element = document.createElement('input')
  for (const [name, value] of Object.entries(attributes))
    element.setAttribute(name, value)
  document.body.appendChild(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('fillAllFields', () => {
  it('fills every detected field, also those that never got an icon', () => {
    const email = input({ type: 'email', name: 'email' })
    const password = input({ type: 'password', name: 'passwd' })
    const fields: DetectedField[] = [
      { id: 'haex-field-1', element: email, type: 'email', identifier: 'email' },
      { id: 'haex-field-2', element: password, type: 'password', identifier: 'passwd' },
    ]

    fillAllFields(fields, { username: 'anna@example.com', password: 'secret' })

    expect(email.value).toBe('anna@example.com')
    expect(password.value).toBe('secret')
  })

  it('fills the input itself even when a rescan handed out new field ids', () => {
    const password = input({ 'type': 'password', 'name': 'password', 'data-haex-field-id': 'haex-field-old' })
    const fields: DetectedField[] = [{ id: 'haex-field-new', element: password, type: 'password', identifier: 'password' }]

    fillAllFields(fields, { password: 'secret' })

    expect(password.value).toBe('secret')
  })

  it('never types the vault\'s TOTP marker into a one-time-code field', () => {
    const code = input({ name: 'otp', autocomplete: 'one-time-code' })
    const fields: DetectedField[] = [{ id: 'haex-field-1', element: code, type: 'otp', identifier: 'otp' }]

    fillAllFields(fields, { otp: 'TOTP' })

    expect(code.value).toBe('')
  })

  it('fills the current code into the one-time-code field', () => {
    const code = input({ name: 'code' })
    const fields: DetectedField[] = [{ id: 'haex-field-1', element: code, type: 'otp', identifier: 'code' }]

    fillAllFields(fields, { otp: 'TOTP' }, null, '123456')

    expect(code.value).toBe('123456')
  })
})
