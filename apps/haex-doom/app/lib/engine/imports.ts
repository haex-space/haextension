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
  netSend: (peer: number, data: Uint8Array) => void;
  /** Writes the next datagram (4-byte LE peer prefix + packet) into `target`, returns its length or 0. */
  netRecv: (target: Uint8Array) => number;
  /** Peer number for an address name, or -1. */
  netResolve: (name: string) => number;
}

export function createHaexImports(): HaexImports {
  return {
    fileWritten: () => {},
    fileRemoved: () => {},
    haptic: () => {},
    netSend: () => {},
    netRecv: () => 0,
    netResolve: () => -1,
  };
}
