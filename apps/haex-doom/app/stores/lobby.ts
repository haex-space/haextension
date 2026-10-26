import { createLobby } from "~/lib/lobby";

const NAME_KEY = "multiplayer:displayName";
const DEFAULT_NAME = "Player";

/**
 * The multiplayer lobby of this page (host and guest state machines in lib/lobby.ts). It also
 * remembers the display name the player last used.
 */
export const useLobbyStore = defineStore("lobby", () => {
  const vault = useHaexVaultStore();
  const games = useGamesStore();
  const engine = useEngine();
  const displayName = ref("");

  const lobby = createLobby({
    peers: usePeers().session(),
    games: () => games.all,
    version: () => vault.client.extensionInfo?.version ?? "0.0.0",
    displayName: () => displayName.value || DEFAULT_NAME,
    // A single-player game running here cannot take an invitation; a netgame is the lobby's own.
    busy: () => engine.state.value === "loading" || engine.state.value === "running",
    contacts: vault.client.contacts,
  });

  async function loadDisplayName() {
    try {
      displayName.value ||= (await vault.client.storage.getItem(NAME_KEY)) ?? "";
    } catch (error) {
      console.error("[haex-doom] Could not read the display name:", error);
    }
  }

  async function rememberDisplayName(name: string) {
    displayName.value = name;
    try {
      await vault.client.storage.setItem(NAME_KEY, name);
    } catch (error) {
      console.error("[haex-doom] Could not store the display name:", error);
    }
  }

  return { ...lobby, displayName, loadDisplayName, rememberDisplayName };
});
