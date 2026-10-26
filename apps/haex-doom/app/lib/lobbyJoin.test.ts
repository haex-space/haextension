import { createLobby } from "./lobby";
import { decodeMessage, encodeMessage } from "./lobbyProtocol";
import { describe, expect, it } from "vitest";
import { COOP, DEATHMATCH, FREEDOOM, SHAREWARE, invited, joinedByCode, lab, participant, useLobbyLab } from "./lobbyHarness.testing";

useLobbyLab();

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
    lab.network.befriend(host.vault, friend.vault);
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
    lab.network.befriend(host.vault, guest.vault);
    lab.network.befriend(host.vault, other.vault);
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
    await lab.network.settle();
    expect(old.lobby.active.value).toBe(false);
    expect(old.lobby.notice.value).toMatchObject({ kind: "rejected", reason: "version" });
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("leaves with the missing game named when the guest does not have it (FR-030)", async () => {
    const host = participant("host");
    const guest = participant("guest", { games: [SHAREWARE] });
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, guest, "Guest");
    await lab.network.settle();
    expect(guest.lobby.active.value).toBe(false);
    expect(guest.lobby.notice.value).toMatchObject({ kind: "incompatible", reason: "game-missing", game: "Freedoom: Phase 1" });
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("rejects a hello for another game", async () => {
    const host = participant("host");
    await host.lobby.openLobby(DEATHMATCH);
    const rogue = lab.network.vault("rogue");
    const received: string[] = [];
    rogue.api.on("message", (event) => received.push(decodeMessage(event.data)?.t ?? "invalid"));
    const { channelId } = await rogue.api.joinAsync(host.lobby.joinCode.value!, "Rogue", { v: 1, extensionVersion: "1.0.0" });
    await lab.network.settle();
    expect(received).toEqual(["lobby"]);

    const hello = { t: "hello", fingerprint: SHAREWARE.fingerprint, extensionVersion: "1.0.0", displayName: "Rogue" } as const;
    await rogue.api.sendAsync(channelId, encodeMessage(hello), { reliable: true });
    await lab.network.settle();
    expect(received).toEqual(["lobby", "reject"]);
    expect(host.lobby.players.value).toHaveLength(0);
  });

  it("refuses the fourth guest of a public lobby as full", async () => {
    const host = participant("host");
    await host.lobby.openLobby(DEATHMATCH);
    for (const name of ["a", "b", "c"]) await joinedByCode(host, participant(name), name);
    const late = participant("late");
    await joinedByCode(host, late, "Late");
    await lab.network.settle();
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
    await lab.network.settle();
    expect(host.lobby.players.value.map((player) => player.state)).toEqual(["joined", "connecting"]);
    expect(host.lobby.canStart.value).toBe(true);
    await host.lobby.startGame();
    await lab.network.settle();
    expect(host.lobby.players.value).toHaveLength(1);
    expect(host.lobby.startRequest.value!.args.slice(0, 3)).toEqual(["-privateserver", "-nodes", "2"]);
  });
});

describe("an invitation that arrives (T052)", () => {
  it("is answered with hello at once, without asking the user again", async () => {
    const host = participant("host");
    const guest = participant("guest");
    await invited(host, guest);
    const hello = lab.network.sent.map((entry) => decodeMessage(entry.data)).find((message) => message?.t === "hello");
    expect(hello).toMatchObject({ fingerprint: FREEDOOM.fingerprint, extensionVersion: "1.0.0", displayName: "guest" });
  });

  it("shows why and leaves when the game is missing", async () => {
    const host = participant("host");
    const guest = participant("guest", { games: [SHAREWARE] });
    await invited(host, guest);
    expect(guest.lobby.active.value).toBe(false);
    expect(guest.lobby.notice.value).toMatchObject({ kind: "incompatible", reason: "game-missing", game: "Freedoom: Phase 1" });
    expect(host.lobby.players.value).toHaveLength(0);
    const leave = lab.network.sent.map((entry) => decodeMessage(entry.data)).find((message) => message?.t === "leave");
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
    lab.network.befriend(host.vault, guest.vault);
    const { inviteId } = await host.vault.api.inviteAsync(host.vault.contactId(guest.vault), { hello: "world" });
    lab.network.accept(inviteId);
    await lab.network.settle();
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
    await lab.network.settle();
    expect(host.lobby.players.value).toHaveLength(1);
    expect(host.lobby.phase.value).toBe("lobby");
  });

  it("lets a guest ignore an invalid start message", async () => {
    const host = participant("host");
    const guest = participant("guest");
    await invited(host, guest);
    const channel = host.lobby.players.value[0]!.channelId;
    await host.vault.api.sendAsync(channel, encodeMessage({ t: "start", nodes: 9, mode: "coop", map: "E1M1", skill: 3 }), { reliable: true });
    await lab.network.settle();
    expect(guest.lobby.phase.value).toBe("lobby");
    expect(guest.lobby.startRequest.value).toBeNull();
  });

  it("holds back a message that arrives before its channel is known and replays it", async () => {
    const host = participant("host");
    const guest = participant("guest");
    lab.network.befriend(host.vault, guest.vault);
    await host.lobby.openLobby(COOP);
    // Deliver the host's lobby message before joinAsync's answer reaches the guest.
    const original = guest.vault.api.joinAsync;
    guest.vault.api.joinAsync = async (...args) => {
      const joined = await original(...args);
      await lab.network.settle();
      return joined;
    };
    expect(await guest.lobby.join(host.lobby.joinCode.value!, "Guest")).toBe("ok");
    await lab.network.settle();
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

  it("skips a contact with a malformed device list", async () => {
    const host = participant("host");
    const valid = { id: "1", displayName: "Valid" };
    const malformed = { id: "2", displayName: "Malformed" };
    const lobby = createLobby({
      peers: host.session,
      games: () => [],
      version: () => "1.0.0",
      displayName: () => "host",
      contacts: {
        listAsync: async () => ({ contacts: [valid, malformed], total: 2 }),
        readAsync: async (id) => id === valid.id
          ? { holziAddresses: { devices: [{}] } }
          : { holziAddresses: { devices: null as unknown as unknown[] } },
      },
    });

    await lobby.loadContacts();

    expect(lobby.contacts.value).toEqual([valid]);
    expect(lobby.contactsFailed.value).toBe(false);
    lobby.dispose();
  });
});
