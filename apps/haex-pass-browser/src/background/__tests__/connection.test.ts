import type { vaultConnection as VaultConnection } from '../connection'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportPublicKey, generateKeyPair } from '../crypto'

vi.mock('../keypairStorage', () => ({
  loadKeypair: async () => generateKeyPair(),
  saveAndVerifyKeypair: async () => {},
}))
vi.mock('~/logic/settings', () => ({ getWebSocketPort: async () => 19455 }))

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

let connection: typeof VaultConnection

async function nextSocket(): Promise<FakeWebSocket> {
  const count = FakeWebSocket.instances.length
  await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(count))
  return FakeWebSocket.instances.at(-1)!
}

function settled(promise: Promise<unknown>): Promise<string> {
  return Promise.race([
    promise.then(() => 'resolved', () => 'rejected'),
    new Promise<string>(resolve => setTimeout(resolve, 50, 'pending')),
  ])
}

beforeEach(async () => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.resetModules()
  connection = (await import('../connection')).vaultConnection
})

afterEach(() => {
  connection.disconnect()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('vaultConnection.connect', () => {
  it('resolves once the socket opens, however long that takes', async () => {
    const connected = connection.connect()
    const socket = await nextSocket()
    await new Promise(resolve => setTimeout(resolve, 150))

    socket.open()

    expect(await settled(connected)).toBe('resolved')
  })

  it('rejects when the socket closes before it opened, and the next connect starts over', async () => {
    const first = connection.connect()
    const socket = await nextSocket()

    socket.close()

    expect(await settled(first)).toBe('rejected')
    const second = connection.connect()
    ;(await nextSocket()).open()
    expect(await settled(second)).toBe('resolved')
  })
})

describe('vaultConnection.sendRequest', () => {
  it('rejects pending requests as soon as the socket closes', async () => {
    const connected = connection.connect()
    const socket = await nextSocket()
    socket.open()
    await connected
    const server = await generateKeyPair()
    socket.receive({ type: 'handshakeResponse', version: 2, serverPublicKey: await exportPublicKey(server.publicKey), authorized: true, pendingApproval: false })
    await vi.waitFor(() => expect(connection.getState().state).toBe('paired'))

    const request = connection.getItems('https://example.com', ['password'])
    await vi.waitFor(() => expect(socket.sent.some(frame => frame.includes('"type":"request"'))).toBe(true))
    socket.close()

    expect(await settled(request)).toBe('rejected')
  })
})
