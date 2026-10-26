import { readonly, ref, type Ref } from "vue";
import type { PeerEventMap, PeerEventType, PeerVisibility } from "@haex-space/vault-sdk";

/**
 * What haex-doom uses of `client.peers` (contracts/peers-api.md). The SDK's `PeersAPI` fits it;
 * tests pass an in-memory fake.
 */
export interface PeersApi {
  inviteAsync(contactId: string, payload: unknown): Promise<{ inviteId: string }>;
  cancelInviteAsync(inviteId: string): Promise<void>;
  openLobbyAsync(lobbyId: string, visibility: PeerVisibility): Promise<{ joinCode: string }>;
  closeLobbyAsync(lobbyId: string): Promise<void>;
  joinAsync(joinCode: string, displayName: string, payload: unknown): Promise<{ channelId: string; lobbyId: string }>;
  removeAsync(channelId: string): Promise<void>;
  sendAsync(channelId: string, data: Uint8Array, options?: { reliable?: boolean }): Promise<void>;
  closeAsync(channelId: string): Promise<void>;
  on<T extends PeerEventType>(type: T, handler: (event: PeerEventMap[T]) => void): () => void;
}

export type PeersAvailability = "unknown" | "available" | "unavailable";

/** The vault's limit for fast messages; DOOM's packets stay far below it. */
const MAX_FAST_BYTES = 1024;
/** Incoming DOOM packets waiting for the engine; the oldest go first when the engine falls behind. */
const MAX_QUEUED_PACKETS = 256;
const PEER_PREFIX_BYTES = 4;
const HOST_NAME = "host";
const PROBE_LOBBY_ID = "haex-doom-probe";

/** The host's `details.reason` of a failed peers call, when it names one. */
export function peerReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("reason" in error)) return null;
  return typeof error.reason === "string" ? error.reason : null;
}

function errorCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "number" ? error.code : null;
}

/** Whether the host answered that it does not know the peers methods (a vault without them). */
export function isUnknownMethod(error: unknown): boolean {
  if (peerReason(error) !== null) return false;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return errorCode(error) === 1001 || /unknown method|method not found|not implemented/i.test(message);
}

/** A permission prompt the user has not answered yet (1004). */
export function isPermissionPrompt(error: unknown): boolean {
  return errorCode(error) === 1004;
}

/**
 * Asks the vault once whether it has the peers methods: closing a lobby that does not exist
 * succeeds. An unanswered permission prompt is "unknown" (ask again after it is resolved); a
 * vault without the methods or a refused permission is "unavailable" (SC-007).
 */
export async function probePeers(api: PeersApi | undefined): Promise<PeersAvailability> {
  if (!api) return "unavailable";
  try {
    await api.closeLobbyAsync(PROBE_LOBBY_ID);
    return "available";
  } catch (error) {
    if (isPermissionPrompt(error)) return "unknown";
    if (!isUnknownMethod(error)) console.warn("[haex-doom] Peer channels are not usable:", error);
    return "unavailable";
  }
}

export interface PeerSessionOptions {
  /** A channel of the running netgame closed: the engine treats that peer as gone (`haex_net_peer_closed`). */
  peerGone?: (peer: number) => void;
}

export interface NetImports {
  netSend: (peer: number, data: Uint8Array) => void;
  netRecv: (target: Uint8Array) => number;
  netResolve: (name: string) => number;
  netActive: () => boolean;
}

/**
 * The channels of one multiplayer session and the bridge between them and the engine.
 *
 * Peer numbers: the engine addresses packets by a peer number. A channel gets the next number,
 * starting at 1, when it is registered, and keeps it until the session is reset; numbers are
 * never reused. The host registers each guest's channel, so its guests are 1, 2, 3 in order of
 * admission; a guest registers only the host's channel, which is therefore always peer 1, and
 * `netResolve("host")` returns it. 0 is never a peer and −1 means "no such address".
 */
export function createPeerSession(api: PeersApi, options: PeerSessionOptions = {}) {
  const peerOfChannel = new Map<string, number>();
  const channelOfPeer = new Map<number, string>();
  let nextPeer = 1;
  let hostChannel: string | null = null;
  const active = ref(false);
  const incoming: { peer: number; data: Uint8Array }[] = [];
  const counters = { sendErrors: 0, dropped: 0 };
  const reliableHandlers = new Set<(channelId: string, data: Uint8Array) => void>();
  const closedHandlers = new Set<(channelId: string, reason: string) => void>();

  const unsubscribe = [
    api.on("message", (event) => {
      if (event.reliable) {
        for (const handler of reliableHandlers) handler(event.channelId, event.data);
        return;
      }
      const peer = peerOfChannel.get(event.channelId);
      if (peer === undefined) return;
      if (incoming.length >= MAX_QUEUED_PACKETS) {
        incoming.shift();
        counters.dropped++;
      }
      incoming.push({ peer, data: event.data });
    }),
    api.on("channel-closed", (event) => {
      const peer = peerOfChannel.get(event.channelId);
      if (peer !== undefined) {
        peerOfChannel.delete(event.channelId);
        channelOfPeer.delete(peer);
        if (event.channelId === hostChannel) hostChannel = null;
        if (active.value) options.peerGone?.(peer);
      }
      for (const handler of closedHandlers) handler(event.channelId, event.reason);
    }),
  ];

  /** The peer number of a channel, assigned on first use. */
  function register(channelId: string): number {
    const known = peerOfChannel.get(channelId);
    if (known !== undefined) return known;
    const peer = nextPeer++;
    peerOfChannel.set(channelId, peer);
    channelOfPeer.set(peer, channelId);
    return peer;
  }

  /** Marks the channel of the host; only a guest has one. */
  function setHost(channelId: string | null) {
    hostChannel = channelId;
    if (channelId !== null) register(channelId);
  }

  function netSend(peer: number, data: Uint8Array) {
    const channelId = channelOfPeer.get(peer);
    if (channelId === undefined || data.length > MAX_FAST_BYTES) {
      counters.dropped++;
      return;
    }
    // The bytes may live in the engine's heap, which can change before the call is sent.
    // Never throw into the engine: a lost datagram is something DOOM's protocol handles.
    api.sendAsync(channelId, data.slice(), { reliable: false }).catch(() => {
      counters.sendErrors++;
    });
  }

  function netRecv(target: Uint8Array): number {
    for (let packet = incoming.shift(); packet; packet = incoming.shift()) {
      const length = PEER_PREFIX_BYTES + packet.data.length;
      if (length > target.length) {
        counters.dropped++;
        continue;
      }
      new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(0, packet.peer, true);
      target.set(packet.data, PEER_PREFIX_BYTES);
      return length;
    }
    return 0;
  }

  function netResolve(name: string): number {
    if (name !== HOST_NAME || hostChannel === null) return -1;
    return peerOfChannel.get(hostChannel) ?? -1;
  }

  return {
    api,
    /** True from the moment a netgame is started until it ends. */
    netActive: readonly(active) as Readonly<Ref<boolean>>,
    stats: counters,
    register,
    setHost,
    peerOf: (channelId: string): number | undefined => peerOfChannel.get(channelId),
    channelOf: (peer: number): string | undefined => channelOfPeer.get(peer),
    /** Packets of the netgame may flow; ones that arrived before are kept for the engine. */
    beginNetgame() {
      active.value = true;
    },
    endNetgame() {
      active.value = false;
      incoming.length = 0;
    },
    /**
     * Forgets all channels and numbers: the session is over. A netgame that still runs learns
     * that every peer is gone, so it ends at once instead of waiting for its own timeout.
     */
    reset() {
      if (active.value) for (const peer of channelOfPeer.keys()) options.peerGone?.(peer);
      active.value = false;
      incoming.length = 0;
      peerOfChannel.clear();
      channelOfPeer.clear();
      hostChannel = null;
      nextPeer = 1;
    },
    onReliable(handler: (channelId: string, data: Uint8Array) => void) {
      reliableHandlers.add(handler);
      return () => reliableHandlers.delete(handler);
    },
    onClosed(handler: (channelId: string, reason: string) => void) {
      closedHandlers.add(handler);
      return () => closedHandlers.delete(handler);
    },
    /** The handlers for the engine's imports (contracts/engine-bridge.md). */
    imports(): NetImports {
      return { netSend, netRecv, netResolve, netActive: () => active.value };
    },
    dispose() {
      for (const off of unsubscribe) off();
    },
  };
}

export type PeerSession = ReturnType<typeof createPeerSession>;
