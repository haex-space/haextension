import { describe, expect, it } from 'vitest'
import { authDataFromAttestationObject } from '../attestation'

function text(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)]
  return [0x60 + bytes.length, ...bytes]
}

/** `{ fmt: 'none', attStmt: {}, authData: <bytes> }` as CBOR, keys in the given order. */
function attestationObject(authData: number[], authDataFirst = false): ArrayBuffer {
  const fmt = [...text('fmt'), ...text('none')]
  const attStmt = [...text('attStmt'), 0xA0]
  const data = [...text('authData'), 0x58, authData.length, ...authData]
  const entries = authDataFirst ? [...data, ...fmt, ...attStmt] : [...fmt, ...attStmt, ...data]
  return new Uint8Array([0xA3, ...entries]).buffer
}

describe('authDataFromAttestationObject', () => {
  const authData = Array.from({ length: 37 }, (_, i) => i)

  it('returns the authData bytes', () => {
    expect([...new Uint8Array(authDataFromAttestationObject(attestationObject(authData)))]).toEqual(authData)
  })

  it('does not depend on key order', () => {
    expect([...new Uint8Array(authDataFromAttestationObject(attestationObject(authData, true)))]).toEqual(authData)
  })

  it('rejects input that is not an attestation object', () => {
    expect(() => authDataFromAttestationObject(new Uint8Array([0x01]).buffer)).toThrow()
    expect(() => authDataFromAttestationObject(new Uint8Array([0xA1, ...text('fmt'), ...text('none')]).buffer)).toThrow('no authData')
  })
})
