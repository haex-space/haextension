import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLobby, type HostSettings, type LocalGame } from "./lobby";
import { decodeMessage, encodeMessage } from "./lobbyProtocol";
import { createPeerSession } from "./peers";
import { FakeNetwork, type FakeVault } from "./peersFake.testing";

const FREEDOOM: LocalGame = { title: "Freedoom: Phase 1", fingerprint: "a".repeat(64), family: "doom1" };
const SHAREWARE: LocalGame = { title: "DOOM (shareware)", fingerprint: "b".repeat(64), family: "doom1" };

const COOP: HostSettings = { game: FREEDOOM, visibility: "contacts", mode: "coop", map: "E1M2", skill: 3 };
const DEATHMATCH: HostSettings = { game: FREEDOOM, visibility: "public", mode: "deathmatch", monsters: false, timeLimit: 10, map: "E1M1", skill: 4 };

interface Participant {
  vault: FakeVault;
  lobby: ReturnType<typeof createLobby>;
  session: ReturnType<typeof createPeerSession>;
  peerGone: ReturnType<typeof vi.fn>;
}

let network: FakeNetwork;
const created: Participant[] = [];

function participant(name: string, options: { games?: LocalGame[]; version?: string; busy?: boolean } = {}): Participant {
  const vault = network.vault(name);
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

const contactOf = (host: Participant, guest: Participant) => ({ id: host.vault.contactId(guest.vault), displayName: `${guest.vault.name} (contact)` });

/** Host opens a lobby; the guest is invited and accepts. */
async function invited(host: Participant, guest: Participant, settings = COOP) {
  network.befriend(host.vault, guest.vault);
  expect(await host.lobby.openLobby(settings)).toBe("ok");
  expect(await host.lobby.invite(contactOf(host, guest))).toBe("ok");
  network.accept(host.lobby.invites.value.at(-1)!.inviteId);
  await network.settle();
}

async function joinedByCode(host: Participant, guest: Participant, name = "Stranger") {
  const code = host.lobby.joinCode.value!;
  expect(await guest.lobby.join(code, name)).toBe("ok");
  await network.settle();
}

beforeEach(() => {
  network = new FakeNetwork();
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

describe("opening a lobby", () => {
  it("stores the join code the vault issued", async () => {
    const host = participant("host");
    expect(await host.lobby.openLobby(COOP)).toBe("ok");
    expect(host.lobby.role.value).toBe("host");
    expect(host.lobby.phase.value).toBe("lobby");
    expect(host.lobby.joinCode.value).toMatch(/^code:/);
    expect(host.lobby.lobbyId.value).toBe("lobby-host");
  });

  it("returns to idle when the vault refuses", async () => {
    const host = participant("host");
    vi.spyOn(host.vault.api, "openLobbyAsync").mockRejectedValue({ reason: "limit" });
    expect(await host.lobby.openLobby(COOP)).toBe("limit");
    expect(host.lobby.active.value).toBe(false);
  });
});

describe("invitation, hello and start (host and guest)", () => {
  it("takes a contact from invited through accepted and hello to a started game", async () => {
    const host = participant("host");
    const guest = participant("guest");
    network.befriend(host.vault, guest.vault);
    await host.lobby.openLobby(COOP);
    expect(await host.lobby.invite(contactOf(host, guest))).toBe("ok");
    expect(host.lobby.invites.value).toMatchObject([{ status: "pending", name: "guest (contact)" }]);
    expect(host.lobby.canStart.value).toBe(false);

    network.accept(host.lobby.invites.value[0]!.inviteId);
    await network.settle();

    expect(host.lobby.invites.value[0]!.status).toBe("accepted");
    expect(host.lobby.players.value).toMatchObject([{ displayName: "guest (contact)", verified: true, state: "joined" }]);
    expect(host.lobby.canStart.value).toBe(true);
    expect(guest.lobby.role.value).toBe("guest");
    expect(guest.lobby.phase.value).toBe("lobby");
    expect(guest.lobby.guestView.value).toMatchObject({
      game: { title: "Freedoom: Phase 1" },
      mode: "coop",
      map: "E1M2",
      players: [{ displayName: "guest (contact)", verified: true, state: "joined" }],
    });

    expect(await host.lobby.startGame()).toBe("ok");
    await network.settle();

    expect(host.lobby.startRequest.value).toEqual({
      role: "host",
      fingerprint: FREEDOOM.fingerprint,
      args: ["-privateserver", "-nodes", "2", "-skill", "3", "-warp", "1", "2"],
    });
    expect(guest.lobby.startRequest.value).toEqual({ role: "guest", fingerprint: FREEDOOM.fingerprint, args: ["-connect", "host"] });
    expect(host.lobby.phase.value).toBe("running");
    expect(guest.lobby.phase.value).toBe("running");
    expect(host.session.imports().netActive()).toBe(true);
    expect(guest.session.imports().netActive()).toBe(true);
    // The host numbers its guest 1; the guest finds the host as peer 1.
    expect(guest.session.imports().netResolve("host")).toBe(1);
  });

  it("sends the invitation payload of the contract", async () => {
    const host = participant("host");
    const guest = participant("guest");
    const invite = vi.spyOn(host.vault.api, "inviteAsync");
    await invited(host, guest, DEATHMATCH);
    expect(invite).toHaveBeenCalledWith(host.vault.contactId(guest.vault), {
      v: 1,
      lobbyId: "lobby-host",
      game: { title: "Freedoom: Phase 1", fingerprint: FREEDOOM.fingerprint },
      mode: "deathmatch",
      monsters: false,
      timeLimit: 10,
      map: "E1M1",
      skill: 4,
      visibility: "public",
      extensionVersion: "1.0.0",
    });
  });

  it("matches a status that arrives before the invitation call returns", async () => {
    const host = participant("host");
    const guest = participant("guest");
    network.befriend(host.vault, guest.vault);
    guest.vault.autoAccept = true;
    await host.lobby.openLobby(COOP);
    expect(await host.lobby.invite(contactOf(host, guest))).toBe("ok");
    await network.settle();
    expect(host.lobby.invites.value[0]!.status).toBe("accepted");
    expect(host.lobby.players.value).toHaveLength(1);
  });

  it("shows declined, not installed, unreachable (with hint) and expired invitations", async () => {
    const host = participant("host");
    const others = ["a", "b", "c"].map((name) => participant(name));
    await host.lobby.openLobby(COOP);
    for (const other of others) {
      network.befriend(host.vault, other.vault);
      await host.lobby.invite(contactOf(host, other));
    }
    const [one, two, three] = host.lobby.invites.value;
    network.resolveInvite(one!.inviteId, "declined");
    network.resolveInvite(two!.inviteId, "unreachable", "share_current_card");
    network.resolveInvite(three!.inviteId, "not-installed");
    await network.settle();
    expect(host.lobby.invites.value.map((entry) => [entry.status, entry.hint])).toEqual([
      ["declined", undefined],
      ["unreachable", "share_current_card"],
      ["not-installed", undefined],
    ]);
    expect(host.lobby.players.value).toHaveLength(0);
    expect(host.lobby.canStart.value).toBe(false);
  });

  it("invites at most three contacts at a time, each only once", async () => {
    const host = participant("host");
    const others = ["a", "b", "c", "d"].map((name) => participant(name));
    await host.lobby.openLobby(COOP);
    for (const other of others) network.befriend(host.vault, other.vault);
    expect(await host.lobby.invite(contactOf(host, others[0]!))).toBe("ok");
    expect(await host.lobby.invite(contactOf(host, others[0]!))).toBe("duplicate");
    expect(await host.lobby.invite(contactOf(host, others[1]!))).toBe("ok");
    expect(await host.lobby.invite(contactOf(host, others[2]!))).toBe("ok");
    expect(await host.lobby.invite(contactOf(host, others[3]!))).toBe("full");
    // A declined invitation frees its place.
    network.resolveInvite(host.lobby.invites.value[0]!.inviteId, "declined");
    expect(await host.lobby.invite(contactOf(host, others[3]!))).toBe("ok");
  });

  it("reports contacts the vault does not know", async () => {
    const host = participant("host");
    await host.lobby.openLobby(COOP);
    expect(await host.lobby.invite({ id: "contact:nobody", displayName: "Nobody" })).toBe("contact_unknown");
    expect(host.lobby.invites.value).toHaveLength(0);
  });

  it("announces deathmatch options in the start message and updates the guests' view", async () => {
    const host = participant("host");
    const guest = participant("guest");
    await invited(host, guest, { ...DEATHMATCH, visibility: "contacts", monsters: true, timeLimit: 20 });
    await host.lobby.startGame();
    await network.settle();
    expect(host.lobby.startRequest.value!.args).toEqual([
      "-privateserver", "-nodes", "2", "-skill", "4", "-warp", "1", "1", "-altdeath", "-timer", "20",
    ]);
    expect(guest.lobby.guestView.value).toMatchObject({ mode: "deathmatch", monsters: true, timeLimit: 20 });
  });

  it("starts with three guests and four nodes, closing the lobby", async () => {
    const host = participant("host");
    const guests = ["a", "b", "c"].map((name) => participant(name));
    for (const guest of guests) {
      network.befriend(host.vault, guest.vault);
      if (host.lobby.phase.value !== "lobby") await host.lobby.openLobby(COOP);
      await host.lobby.invite(contactOf(host, guest));
      network.accept(host.lobby.invites.value.at(-1)!.inviteId);
    }
    await network.settle();
    expect(host.lobby.players.value).toHaveLength(3);
    const closeLobby = vi.spyOn(host.vault.api, "closeLobbyAsync");
    expect(await host.lobby.startGame()).toBe("ok");
    expect(closeLobby).toHaveBeenCalledWith("lobby-host");
    expect(host.lobby.startRequest.value!.args.slice(0, 3)).toEqual(["-privateserver", "-nodes", "4"]);
    await network.settle();
    expect(guests.every((guest) => guest.lobby.phase.value === "running")).toBe(true);
    // Guests are peers 1, 2, 3 in the order they were admitted.
    expect(guests.map((guest) => host.session.peerOf(host.lobby.players.value[guests.indexOf(guest)]!.channelId))).toEqual([1, 2, 3]);
  });

  it("does not start without a guest", async () => {
    const host = participant("host");
    await host.lobby.openLobby(COOP);
    expect(await host.lobby.startGame()).toBe("no-guests");
    expect(host.lobby.phase.value).toBe("lobby");
  });

  it("withdraws open invitations when the game starts", async () => {
    const host = participant("host");
    const guest = participant("guest");
    const slow = participant("slow");
    await invited(host, guest);
    network.befriend(host.vault, slow.vault);
    await host.lobby.invite(contactOf(host, slow));
    const cancel = vi.spyOn(host.vault.api, "cancelInviteAsync");
    await host.lobby.startGame();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("joining by code", () => {
  it("admits a stranger to a public lobby, not verified, under the chosen name", async () => {
    const host = participant("host");
    const stranger = participant("stranger");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, stranger, "  Doomguy\u0007 ");
    expect(host.lobby.players.value).toMatchObject([{ displayName: "Doomguy", verified: false, state: "joined" }]);
    expect(stranger.lobby.guestView.value).toMatchObject({ mode: "deathmatch", map: "E1M1", players: [{ displayName: "Doomguy", verified: false }] });
  });

  it("marks a contact joining by code as verified", async () => {
    const host = participant("host");
    const friend = participant("friend");
    network.befriend(host.vault, friend.vault);
    await host.lobby.openLobby(COOP);
    await joinedByCode(host, friend, "Friend");
    expect(host.lobby.players.value[0]).toMatchObject({ verified: true, contactId: host.vault.contactId(friend.vault) });
  });

  it("refuses a stranger in a contacts-only lobby", async () => {
    const host = participant("host");
    const stranger = participant("stranger");
    await host.lobby.openLobby(COOP);
    expect(await stranger.lobby.join(host.lobby.joinCode.value!, "Stranger")).toBe("not_admitted");
    expect(stranger.lobby.active.value).toBe(false);
  });

  it("reports a closed lobby and an unknown code", async () => {
    const host = participant("host");
    const guest = participant("guest");
    const other = participant("other");
    network.befriend(host.vault, guest.vault);
    network.befriend(host.vault, other.vault);
    await host.lobby.openLobby(COOP);
    const code = host.lobby.joinCode.value!;
    await joinedByCode(host, other, "Other");
    await host.lobby.startGame();
    expect(await guest.lobby.join(code, "Late")).toBe("lobby_closed");
    expect(await guest.lobby.join("nonsense", "Late")).toBe("lobby_closed");
  });

  it("does not join while a game runs here", async () => {
    const host = participant("host");
    const busy = participant("busy", { busy: true });
    await host.lobby.openLobby(DEATHMATCH);
    expect(await busy.lobby.join(host.lobby.joinCode.value!, "Busy")).toBe("busy");
  });

  it("sends the version with the join and lets the host reject another version", async () => {
    const host = participant("host");
    const old = participant("old", { version: "0.9.0" });
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, old, "Old");
    await network.settle();
    expect(old.lobby.active.value).toBe(false);
    expect(old.lobby.notice.value).toMatchObject({ kind: "rejected", reason: "version" });
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("leaves with the missing game named when the guest does not have it (FR-030)", async () => {
    const host = participant("host");
    const guest = participant("guest", { games: [SHAREWARE] });
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, guest, "Guest");
    await network.settle();
    expect(guest.lobby.active.value).toBe(false);
    expect(guest.lobby.notice.value).toMatchObject({ kind: "incompatible", reason: "game-missing", game: "Freedoom: Phase 1" });
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("rejects a hello for another game", async () => {
    const host = participant("host");
    await host.lobby.openLobby(DEATHMATCH);
    const rogue = network.vault("rogue");
    const received: string[] = [];
    rogue.api.on("message", (event) => received.push(decodeMessage(event.data)?.t ?? "invalid"));
    const { channelId } = await rogue.api.joinAsync(host.lobby.joinCode.value!, "Rogue", { v: 1, extensionVersion: "1.0.0" });
    await network.settle();
    expect(received).toEqual(["lobby"]);

    const hello = { t: "hello", fingerprint: SHAREWARE.fingerprint, extensionVersion: "1.0.0", displayName: "Rogue" } as const;
    await rogue.api.sendAsync(channelId, encodeMessage(hello), { reliable: true });
    await network.settle();
    expect(received).toEqual(["lobby", "reject"]);
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("refuses the fourth guest of a public lobby as full", async () => {
    const host = participant("host");
    await host.lobby.openLobby(DEATHMATCH);
    for (const name of ["a", "b", "c"]) await joinedByCode(host, participant(name), name);
    const late = participant("late");
    await joinedByCode(host, late, "Late");
    await network.settle();
    expect(late.lobby.notice.value).toMatchObject({ kind: "rejected", reason: "full" });
    expect(host.lobby.players.value).toHaveLength(3);
  });

  it("starts without a guest that did not say hello and closes its channel", async () => {
    const host = participant("host");
    const ready = participant("ready");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, ready, "Ready");
    // A peer that joined but never sends a hello.
    const mute = participant("mute");
    await mute.vault.api.joinAsync(host.lobby.joinCode.value!, "Mute", { v: 1, extensionVersion: "1.0.0" });
    await network.settle();
    expect(host.lobby.players.value.map((player) => player.state)).toEqual(["joined", "connecting"]);
    expect(host.lobby.canStart.value).toBe(true);
    await host.lobby.startGame();
    await network.settle();
    expect(host.lobby.players.value).toHaveLength(1);
    expect(host.lobby.startRequest.value!.args.slice(0, 3)).toEqual(["-privateserver", "-nodes", "2"]);
  });
});

describe("removing a player", () => {
  it("tells the player, closes its channel and keeps it out of the lobby (FR-045)", async () => {
    const host = participant("host");
    const other = participant("other");
    const stranger = participant("stranger");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, other, "Other");
    await joinedByCode(host, stranger, "Stranger");
    expect(host.lobby.players.value).toHaveLength(2);

    await host.lobby.removePlayer(host.lobby.players.value[1]!.channelId);
    await network.settle();

    expect(host.lobby.players.value.map((player) => player.displayName)).toEqual(["Other"]);
    expect(stranger.lobby.active.value).toBe(false);
    expect(stranger.lobby.notice.value).toMatchObject({ kind: "rejected", reason: "removed" });
    expect(await stranger.lobby.join(host.lobby.joinCode.value!, "Stranger")).toBe("not_admitted");
    expect(other.lobby.guestView.value!.players.map((player) => player.displayName)).toEqual(["Other"]);
  });
});

describe("leaving", () => {
  it("lets a guest leave the lobby; the others see the new list", async () => {
    const host = participant("host");
    const a = participant("a");
    const b = participant("b");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, a, "A");
    await joinedByCode(host, b, "B");
    await a.lobby.leave();
    await network.settle();
    expect(a.lobby.active.value).toBe(false);
    expect(host.lobby.players.value.map((player) => player.displayName)).toEqual(["B"]);
    expect(b.lobby.guestView.value!.players.map((player) => player.displayName)).toEqual(["B"]);
    expect(host.lobby.notice.value).toBeNull();
  });

  it("lets the other players continue when a guest leaves a running game, with a notice (FR-032)", async () => {
    const host = participant("host");
    const a = participant("a");
    const b = participant("b");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, a, "Anna");
    await joinedByCode(host, b, "Ben");
    await host.lobby.startGame();
    await network.settle();

    await a.lobby.engineStopped();
    await network.settle();

    expect(host.lobby.phase.value).toBe("running");
    expect(b.lobby.phase.value).toBe("running");
    expect(host.lobby.notice.value).toMatchObject({ kind: "guest-left", name: "Anna" });
    expect(host.lobby.players.value.map((player) => player.displayName)).toEqual(["Ben"]);
    expect(host.peerGone).toHaveBeenCalledTimes(1);
    expect(host.peerGone).toHaveBeenCalledWith(1);
  });

  it("ends the game for everyone when the host leaves, with a notice (FR-032)", async () => {
    const host = participant("host");
    const a = participant("a");
    const b = participant("b");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, a, "Anna");
    await joinedByCode(host, b, "Ben");
    await host.lobby.startGame();
    await network.settle();

    await host.lobby.engineStopped();
    await network.settle();

    expect(host.lobby.active.value).toBe(false);
    for (const guest of [a, b]) {
      expect(guest.lobby.active.value).toBe(false);
      expect(guest.lobby.notice.value).toMatchObject({ kind: "host-left" });
      expect(guest.session.imports().netActive()).toBe(false);
    }
    expect(a.peerGone).toHaveBeenCalledWith(1);
  });

  it("ends a lobby the host cancels, withdrawing invitations and telling the guests", async () => {
    const host = participant("host");
    const guest = participant("guest");
    const pending = participant("pending");
    await invited(host, guest);
    network.befriend(host.vault, pending.vault);
    await host.lobby.invite(contactOf(host, pending));
    const cancel = vi.spyOn(host.vault.api, "cancelInviteAsync");
    const closeLobby = vi.spyOn(host.vault.api, "closeLobbyAsync");

    await host.lobby.leave();
    await network.settle();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(closeLobby).toHaveBeenCalledWith("lobby-host");
    expect(host.lobby.active.value).toBe(false);
    expect(guest.lobby.active.value).toBe(false);
    expect(guest.lobby.notice.value).toMatchObject({ kind: "host-left" });
  });

  it("treats a lost connection of the host as connection lost and of a guest as a guest leaving", async () => {
    const host = participant("host");
    const guest = participant("guest");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, guest, "Anna");
    await host.lobby.startGame();
    await network.settle();

    network.drop(host.lobby.players.value[0]!.channelId, "timeout");
    await network.settle();

    expect(guest.lobby.notice.value).toMatchObject({ kind: "connection-lost" });
    expect(guest.lobby.active.value).toBe(false);
    expect(host.lobby.notice.value).toMatchObject({ kind: "guest-left", name: "Anna" });
    expect(host.lobby.phase.value).toBe("running");
  });
});

describe("an invitation that arrives (T052)", () => {
  it("is answered with hello at once, without asking the user again", async () => {
    const host = participant("host");
    const guest = participant("guest");
    await invited(host, guest);
    const hello = network.sent.map((entry) => decodeMessage(entry.data)).find((message) => message?.t === "hello");
    expect(hello).toMatchObject({ fingerprint: FREEDOOM.fingerprint, extensionVersion: "1.0.0", displayName: "guest" });
  });

  it("shows why and leaves when the game is missing", async () => {
    const host = participant("host");
    const guest = participant("guest", { games: [SHAREWARE] });
    await invited(host, guest);
    expect(guest.lobby.active.value).toBe(false);
    expect(guest.lobby.notice.value).toMatchObject({ kind: "incompatible", reason: "game-missing", game: "Freedoom: Phase 1" });
    expect(host.lobby.players.value).toHaveLength(0);
    const leave = network.sent.map((entry) => decodeMessage(entry.data)).find((message) => message?.t === "leave");
    expect(leave).toBeDefined();
  });

  it("shows why and leaves when the version differs", async () => {
    const host = participant("host");
    const guest = participant("guest", { version: "2.0.0" });
    await invited(host, guest);
    expect(guest.lobby.notice.value).toMatchObject({ kind: "incompatible", reason: "version" });
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("is refused while the player is busy or already in a lobby", async () => {
    const host = participant("host");
    const busy = participant("busy", { busy: true });
    await invited(host, busy);
    expect(busy.lobby.notice.value).toMatchObject({ kind: "busy" });
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("closes a channel whose payload is not an invitation of ours", async () => {
    const host = participant("host");
    const guest = participant("guest");
    network.befriend(host.vault, guest.vault);
    const { inviteId } = await host.vault.api.inviteAsync(host.vault.contactId(guest.vault), { hello: "world" });
    network.accept(inviteId);
    await network.settle();
    expect(guest.lobby.active.value).toBe(false);
    expect(guest.lobby.notice.value).toMatchObject({ kind: "invalid-invitation" });
  });
});

describe("untrusted messages", () => {
  it("lets the host ignore bytes that are not a valid message and messages only a host may send", async () => {
    const host = participant("host");
    const guest = participant("guest");
    await invited(host, guest);
    const channel = guest.session.channelOf(1)!;
    await guest.vault.api.sendAsync(channel, new TextEncoder().encode("{garbage"), { reliable: true });
    await guest.vault.api.sendAsync(channel, encodeMessage({ t: "reject", reason: "full" }), { reliable: true });
    await guest.vault.api.sendAsync(channel, encodeMessage({ t: "start", nodes: 2, mode: "coop", map: "E1M1", skill: 3 }), { reliable: true });
    await network.settle();
    expect(host.lobby.players.value).toHaveLength(1);
    expect(host.lobby.phase.value).toBe("lobby");
  });

  it("lets a guest ignore an invalid start message", async () => {
    const host = participant("host");
    const guest = participant("guest");
    await invited(host, guest);
    const channel = host.lobby.players.value[0]!.channelId;
    await host.vault.api.sendAsync(channel, encodeMessage({ t: "start", nodes: 9, mode: "coop", map: "E1M1", skill: 3 }), { reliable: true });
    await network.settle();
    expect(guest.lobby.phase.value).toBe("lobby");
    expect(guest.lobby.startRequest.value).toBeNull();
  });

  it("holds back a message that arrives before its channel is known and replays it", async () => {
    const host = participant("host");
    const guest = participant("guest");
    network.befriend(host.vault, guest.vault);
    await host.lobby.openLobby(COOP);
    // Deliver the host's lobby message before joinAsync's answer reaches the guest.
    const original = guest.vault.api.joinAsync;
    guest.vault.api.joinAsync = async (...args) => {
      const joined = await original(...args);
      await network.settle();
      return joined;
    };
    expect(await guest.lobby.join(host.lobby.joinCode.value!, "Guest")).toBe("ok");
    await network.settle();
    expect(guest.lobby.guestView.value).toMatchObject({ game: { title: "Freedoom: Phase 1" } });
    expect(host.lobby.players.value[0]!.state).toBe("joined");
  });
});

describe("contacts", () => {
  it("lists the contacts whose card has a device", async () => {
    const host = participant("host");
    const withDevice = { id: "1", displayName: "Zed" };
    const without = { id: "2", displayName: "Bob" };
    const lobby = createLobby({
      peers: host.session,
      games: () => [FREEDOOM],
      version: () => "1.0.0",
      displayName: () => "host",
      contacts: {
        listAsync: async () => ({ contacts: [withDevice, without], total: 2 }),
        readAsync: async (id) => ({ holziAddresses: id === "1" ? { devices: [{}] } : { devices: [] } }),
      },
    });
    await lobby.loadContacts();
    expect(lobby.contacts.value).toEqual([withDevice]);
    lobby.dispose();
  });

  it("reports when the contacts cannot be read", async () => {
    const host = participant("host");
    const lobby = createLobby({
      peers: host.session,
      games: () => [],
      version: () => "1.0.0",
      displayName: () => "host",
      contacts: { listAsync: () => Promise.reject(new Error("denied")), readAsync: async () => ({}) },
    });
    await lobby.loadContacts();
    expect(lobby.contactsFailed.value).toBe(true);
    lobby.dispose();
  });
});
