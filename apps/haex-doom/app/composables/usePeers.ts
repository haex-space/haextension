import { HAEXTENSION_EVENTS } from "@haex-space/vault-sdk";
import { createPeerSession, probePeers, type PeerSession, type PeersApi, type PeersAvailability } from "~/lib/peers";

/** Stands in for `client.peers` on a vault without it: nothing works, nothing is announced. */
const UNAVAILABLE_API: PeersApi = {
  inviteAsync: () => Promise.reject(new Error("Peer channels are not available")),
  cancelInviteAsync: () => Promise.reject(new Error("Peer channels are not available")),
  openLobbyAsync: () => Promise.reject(new Error("Peer channels are not available")),
  closeLobbyAsync: () => Promise.reject(new Error("Peer channels are not available")),
  joinAsync: () => Promise.reject(new Error("Peer channels are not available")),
  removeAsync: () => Promise.reject(new Error("Peer channels are not available")),
  sendAsync: () => Promise.reject(new Error("Peer channels are not available")),
  closeAsync: () => Promise.reject(new Error("Peer channels are not available")),
  on: () => () => {},
};

const availability = ref<PeersAvailability>("unknown");
let session: PeerSession | null = null;
let detecting: Promise<void> | null = null;
let listeningForPermission = false;

/**
 * Multiplayer through the vault's peer channels: whether the vault has them (SC-007) and the
 * session that carries the lobby messages and the engine's datagrams (lib/peers.ts).
 */
export function usePeers() {
  const vault = useHaexVaultStore();
  const engine = useEngine();
  const client = () => vault.client;
  const realApi = () => (client() as { peers?: PeersApi }).peers;

  /** Probes the vault once; call again after a permission prompt was answered. */
  function detect(): Promise<void> {
    detecting ??= (async () => {
      try {
        await vault.initializeAsync();
        availability.value = await probePeers(realApi());
      } catch (error) {
        console.error("[haex-doom] Could not check for peer channels:", error);
        availability.value = "unavailable";
      }
      if (availability.value === "unknown" && !listeningForPermission) {
        listeningForPermission = true;
        // The probe hit an open permission prompt: ask again once the user has answered it.
        client().on(HAEXTENSION_EVENTS.PERMISSION_RESOLVED, () => {
          if (availability.value !== "unknown") return;
          detecting = null;
          void detect();
        });
      }
    })().finally(() => {
      if (availability.value !== "unknown") return;
      detecting = null;
    });
    return detecting;
  }

  /**
   * The session of this page. `client.peers` exists with the SDK even when the vault lacks the
   * methods (only its calls fail then), so the session does not wait for the probe.
   */
  function getSession(): PeerSession {
    session ??= createPeerSession(realApi() ?? UNAVAILABLE_API, {
      peerGone: (peer) => engine.netPeerClosed(peer),
    });
    return session;
  }

  return {
    availability: readonly(availability),
    available: computed(() => availability.value === "available"),
    detect,
    session: getSession,
  };
}
