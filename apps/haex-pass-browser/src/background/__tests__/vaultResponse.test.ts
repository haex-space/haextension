import { describe, expect, it } from 'vitest'
import { relayVaultRequest, toBridgeResult } from '../vaultResponse'

describe('toBridgeResult', () => {
  it('passes the data of a successful answer on', () => {
    expect(toBridgeResult({ requestId: 'r1', success: true, data: { entries: [] } })).toEqual({ success: true, data: { entries: [] } })
  })

  it('reports the vault\'s error, or a generic one', () => {
    expect(toBridgeResult({ success: false, error: 'denied' })).toEqual({ success: false, error: 'denied' })
    expect(toBridgeResult({ success: false })).toEqual({ success: false, error: 'Unknown error' })
    expect(toBridgeResult(undefined)).toEqual({ success: false, error: 'Unknown error' })
  })
})

describe('relayVaultRequest', () => {
  it('turns a failed request into an error reply', async () => {
    await expect(relayVaultRequest(Promise.reject(new Error('Request timeout')))).resolves.toEqual({ success: false, error: 'Error: Request timeout' })
  })
})
