import type { Ref } from "vue";

/**
 * The parts of `useEngine()` that the netgame work of the engine side adds (contracts/engine-bridge.md):
 * `peerClosed` forwards `haex_net_peer_closed`, `lastExit` reports why the engine stopped.
 * ponytail: typed here as optional so the shell builds and stays inert on a base without them;
 * once `useEngine` exports both, call it directly and drop this adapter.
 */
export interface EngineNet {
  peerClosed?: (peer: number) => void;
  lastExit?: Readonly<Ref<{ isError: boolean; message: string } | null>>;
}

export function engineNet(engine: object): EngineNet {
  return engine as EngineNet;
}
