import type { ExternalConnection } from '@haex-space/vault-sdk'
import { ExternalConnectionErrorCode, ExternalConnectionState } from '@haex-space/vault-sdk'

/**
 * The observable side of the vault connection: state, last error and the
 * subscribers that hear about changes. The connection manager mutates it and
 * calls `notify()` after each transition.
 */
export class ConnectionStatus {
  state: ExternalConnectionState = ExternalConnectionState.DISCONNECTED
  errorCode: ExternalConnectionErrorCode = ExternalConnectionErrorCode.NONE
  errorMessage: string | null = null
  private readonly handlers = new Set<(state: ExternalConnection) => void>()

  constructor(private readonly clientId: () => string | null) {}

  snapshot(): ExternalConnection {
    return {
      state: this.state,
      clientId: this.clientId(),
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
    }
  }

  setError(code: ExternalConnectionErrorCode, message: string | null = null) {
    this.errorCode = code
    this.errorMessage = message
  }

  clearError() {
    this.errorCode = ExternalConnectionErrorCode.NONE
    this.errorMessage = null
  }

  notify() {
    const snapshot = this.snapshot()
    this.handlers.forEach(handler => handler(snapshot))
  }

  /** Calls `handler` now with the current state, then on every change. */
  subscribe(handler: (state: ExternalConnection) => void): () => void {
    this.handlers.add(handler)
    handler(this.snapshot())
    return () => this.handlers.delete(handler)
  }

  /**
   * Wait until the WebSocket handshake completed and the client is paired
   * (either via permanent or session authorization). Resolves the moment
   * state transitions to PAIRED, rejects on terminal failure states or after
   * the timeout elapses.
   *
   * Without this, content scripts that fire a request right after a service
   * worker wakeup race ahead of the handshake response and get
   * "Handshake not complete".
   */
  async waitForPaired(timeoutMs: number): Promise<void> {
    if (this.state === ExternalConnectionState.PAIRED)
      return

    await new Promise<void>((resolve, reject) => {
      let unsubscribe: () => void = () => {}
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for handshake/authorization (state=${this.state})`))
      }, timeoutMs)

      unsubscribe = this.subscribe((state) => {
        if (state.state === ExternalConnectionState.PAIRED) {
          clearTimeout(timer)
          unsubscribe()
          resolve()
        } else if (state.state === ExternalConnectionState.DISCONNECTED) {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(`Disconnected while waiting for pairing (error=${state.errorMessage ?? state.errorCode})`))
        }
      })
    })
  }
}
