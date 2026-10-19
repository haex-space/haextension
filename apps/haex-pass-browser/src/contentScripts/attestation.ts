// Reads `authData` out of a WebAuthn attestation object (a CBOR map
// `{ fmt, attStmt, authData }`), for `AuthenticatorAttestationResponse.
// getAuthenticatorData()`. Only definite-length CBOR, which is all an
// attestation object may use.

const MAJOR_BYTES = 2
const MAJOR_TEXT = 3
const MAJOR_ARRAY = 4
const MAJOR_MAP = 5
const MAJOR_TAG = 6

class CborReader {
  private offset = 0

  constructor(private readonly bytes: Uint8Array) {}

  head(): { major: number, value: number } {
    const initial = this.byte()
    const major = initial >> 5
    const info = initial & 0x1F
    if (info < 24)
      return { major, value: info }
    if (info === 24)
      return { major, value: this.byte() }
    if (info === 25)
      return { major, value: this.uint(2) }
    if (info === 26)
      return { major, value: this.uint(4) }
    throw new Error(`unsupported CBOR length encoding ${info}`)
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length)
      throw new Error('truncated CBOR')
    const slice = this.bytes.slice(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  /** Skips one complete item. */
  skip(): void {
    const { major, value } = this.head()
    if (major === MAJOR_BYTES || major === MAJOR_TEXT) {
      this.take(value)
    } else if (major === MAJOR_ARRAY) {
      for (let i = 0; i < value; i++) this.skip()
    } else if (major === MAJOR_MAP) {
      for (let i = 0; i < value * 2; i++) this.skip()
    } else if (major === MAJOR_TAG) {
      this.skip()
    }
  }

  private byte(): number {
    return this.take(1)[0]
  }

  private uint(size: number): number {
    return this.take(size).reduce((acc, byte) => acc * 256 + byte, 0)
  }
}

export function authDataFromAttestationObject(attestationObject: ArrayBuffer): ArrayBuffer {
  const reader = new CborReader(new Uint8Array(attestationObject))
  const map = reader.head()
  if (map.major !== MAJOR_MAP)
    throw new Error('attestation object is not a CBOR map')
  for (let i = 0; i < map.value; i++) {
    const key = reader.head()
    if (key.major !== MAJOR_TEXT)
      throw new Error('attestation object keys must be text')
    const name = new TextDecoder().decode(reader.take(key.value))
    if (name !== 'authData') {
      reader.skip()
      continue
    }
    const value = reader.head()
    if (value.major !== MAJOR_BYTES)
      throw new Error('authData is not a byte string')
    return reader.take(value.value).buffer as ArrayBuffer
  }
  throw new Error('attestation object has no authData')
}
