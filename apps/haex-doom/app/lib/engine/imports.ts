/**
 * The functions the engine calls in the shell (engine/src/haex_imports.c forwards to
 * `Module.haexImports`). Each handler is replaced by the feature that owns it; the defaults
 * do nothing, so a feature that is not wired yet never breaks the game.
 */
export interface HaexImports {
  fileWritten: (path: string) => void;
  fileRemoved: (path: string) => void;
  /** 0 = the player fired, 1 = the player was hurt. */
  haptic: (kind: number) => void;
  /** Whether a peer session for the netgame is active; the engine starts a netgame only then. */
  netActive: () => boolean;
  /** Sends one unreliable datagram of at most 1,024 bytes on the channel of `peer`. */
  netSend: (peer: number, data: Uint8Array) => void;
  /**
   * Writes the next queued datagram (4-byte LE peer number + packet) into `target` and returns
   * its length including the prefix, or 0 when the queue is empty. Never blocks.
   */
  netRecv: (target: Uint8Array) => number;
  /** Peer number (0 or greater) for an address name (`"host"` on a guest), or -1. */
  netResolve: (name: string) => number;
  /** The engine is about to exit: `isError` for I_Error (the message is its text), otherwise a Quit with an optional notice. */
  engineExit: (isError: boolean, message: string) => void;
}

export function createHaexImports(): HaexImports {
  return {
    fileWritten: () => {},
    fileRemoved: () => {},
    haptic: () => {},
    netActive: () => false,
    netSend: () => {},
    netRecv: () => 0,
    netResolve: () => -1,
    engineExit: () => {},
  };
}
