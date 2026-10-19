import { describe, expect, it } from 'vitest'
import { parseItemEntries } from '../haexPassApi'

describe('parseItemEntries', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const entries = parseItemEntries({
      entries: [
        { id: 'e1', title: 'Example', url: 'https://example.com', fields: { username: 'anna', otp: 'TOTP' }, hasTotp: true },
        { id: 'e2', title: 'No fields' },
        { id: 3, title: 'Wrong id', fields: {} },
        null,
      ],
    })

    expect(entries).toEqual([
      { id: 'e1', title: 'Example', url: 'https://example.com', fields: { username: 'anna', otp: 'TOTP' }, hasTotp: true, autofillAliases: null },
    ])
  })

  it('returns no entries for an answer without a list', () => {
    expect(parseItemEntries(undefined)).toEqual([])
    expect(parseItemEntries({ entries: 'nope' })).toEqual([])
  })
})
