import type { DetectedField } from '../detector'
import type { ItemEntry } from '~/logic/haexPassApi'
import { afterEach, describe, expect, it } from 'vitest'
import { fillAllFields, shouldShowIconForField } from '../autofill'

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

function entry(hasTotp: boolean): ItemEntry {
  return { id: 'e1', title: 'GitHub', url: null, fields: { username: 'anna' }, hasTotp }
}

describe('shouldShowIconForField', () => {
  it('shows the icon on a one-time-code field of any name when an entry has a TOTP', () => {
    const code = input({ name: 'app_otp', autocomplete: 'one-time-code' })
    const field: DetectedField = { id: 'haex-field-1', element: code, type: 'otp', identifier: 'app_otp' }

    expect(shouldShowIconForField(field, [entry(true)])).toBe(true)
    expect(shouldShowIconForField(field, [entry(false)])).toBe(false)
  })
})

describe('fillAllFields with a code split over boxes', () => {
  it('puts one digit into each box, once, also when every box was detected', () => {
    document.body.innerHTML = `
      <form><div class="otp">
        ${Array.from({ length: 6 }, (_, i) => `<span><input name="otp-${i}" maxlength="1" autocomplete="one-time-code"></span>`).join('')}
      </div></form>`
    const boxes = Array.from(document.querySelectorAll('input'))
    const fields: DetectedField[] = boxes.map((box, i) => ({ id: `haex-field-${i}`, element: box, type: 'otp', identifier: box.name }))

    fillAllFields(fields, { otp: 'TOTP' }, null, '123456')

    expect(boxes.map(box => box.value)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('starts at the detected box when only the first one is recognised', () => {
    document.body.innerHTML = `
      <div><input name="email"></div>
      <div class="otp">
        <input autocomplete="one-time-code" maxlength="1"><input maxlength="1"><input maxlength="1">
        <input maxlength="1"><input maxlength="1"><input maxlength="1">
      </div>`
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('.otp input'))
    const fields: DetectedField[] = [{ id: 'haex-field-1', element: boxes[0]!, type: 'otp', identifier: 'one-time-code' }]

    fillAllFields(fields, { otp: 'TOTP' }, null, '654321')

    expect(boxes.map(box => box.value)).toEqual(['6', '5', '4', '3', '2', '1'])
    expect((document.querySelector('input[name="email"]') as HTMLInputElement).value).toBe('')
  })
})
