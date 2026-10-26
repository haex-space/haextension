import { afterEach, beforeEach, expect, vi } from "vitest";
import { createLobby, type HostSettings, type LocalGame } from "./lobby";
import { createPeerSession } from "./peers";
import { FakeNetwork, type FakeVault } from "./peersFake.testing";

export const FREEDOOM: LocalGame = { title: "Freedoom: Phase 1", fingerprint: "a".repeat(64), family: "doom1" };
export const SHAREWARE: LocalGame = { title: "DOOM (shareware)", fingerprint: "b".repeat(64), family: "doom1" };

export const COOP: HostSettings = { game: FREEDOOM, visibility: "contacts", mode: "coop", map: "E1M2", skill: 3 };
export const DEATHMATCH: HostSettings = { game: FREEDOOM, visibility: "public", mode: "deathmatch", monsters: false, timeLimit: 10, map: "E1M1", skill: 4 };

export interface Participant {
  vault: FakeVault;
  lobby: ReturnType<typeof createLobby>;
  session: ReturnType<typeof createPeerSession>;
  peerGone: ReturnType<typeof vi.fn>;
}

/** The fake network of the running test. */
export const lab = { network: new FakeNetwork() };
const created: Participant[] = [];

/** Gives each test a fresh network and tidies up its participants; call once per test file. */
export function useLobbyLab() {
  beforeEach(() => {
    lab.network = new FakeNetwork();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const entry of created.splice(0)) {
      entry.lobby.dispose();
      entry.session.dispose();
    }
    vi.restoreAllMocks();
  });
}

export function participant(name: string, options: { games?: LocalGame[]; version?: string; busy?: boolean } = {}): Participant {
  const vault = lab.network.vault(name);
  const peerGone = vi.fn();
  const session = createPeerSession(vault.api, { peerGone });
  const lobby = createLobby({
    peers: session,
    games: () => options.games ?? [FREEDOOM],
    version: () => options.version ?? "1.0.0",
    displayName: () => name,
    busy: () => options.busy ?? false,
    newLobbyId: () => `lobby-${name}`,
    sleep: async () => {},
  });
  const entry = { vault, lobby, session, peerGone };
  created.push(entry);
  return entry;
}

export const contactOf = (host: Participant, guest: Participant) => ({ id: host.vault.contactId(guest.vault), displayName: `${guest.vault.name} (contact)` });

/** Host opens a lobby; the guest is invited and accepts. */
export async function invited(host: Participant, guest: Participant, settings = COOP) {
  lab.network.befriend(host.vault, guest.vault);
  expect(await host.lobby.openLobby(settings)).toBe("ok");
  expect(await host.lobby.invite(contactOf(host, guest))).toBe("ok");
  lab.network.accept(host.lobby.invites.value.at(-1)!.inviteId);
  await lab.network.settle();
}

export async function joinedByCode(host: Participant, guest: Participant, name = "Stranger") {
  const code = host.lobby.joinCode.value!;
  expect(await guest.lobby.join(code, name)).toBe("ok");
  await lab.network.settle();
}
