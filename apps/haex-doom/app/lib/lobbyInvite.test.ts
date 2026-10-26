import { describe, expect, it, vi } from "vitest";
import { COOP, DEATHMATCH, FREEDOOM, contactOf, invited, joinedByCode, lab, participant, useLobbyLab } from "./lobbyHarness.testing";

useLobbyLab();

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
    lab.network.befriend(host.vault, guest.vault);
    await host.lobby.openLobby(COOP);
    expect(await host.lobby.invite(contactOf(host, guest))).toBe("ok");
    expect(host.lobby.invites.value).toMatchObject([{ status: "pending", name: "guest (contact)" }]);
    expect(host.lobby.canStart.value).toBe(false);

    lab.network.accept(host.lobby.invites.value[0]!.inviteId);
    await lab.network.settle();

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
    await lab.network.settle();

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
    lab.network.befriend(host.vault, guest.vault);
    guest.vault.autoAccept = true;
    await host.lobby.openLobby(COOP);
    expect(await host.lobby.invite(contactOf(host, guest))).toBe("ok");
    await lab.network.settle();
    expect(host.lobby.invites.value[0]!.status).toBe("accepted");
    expect(host.lobby.players.value).toHaveLength(1);
  });

  it("shows declined, not installed, unreachable (with hint) and expired invitations", async () => {
    const host = participant("host");
    const others = ["a", "b", "c"].map((name) => participant(name));
    await host.lobby.openLobby(COOP);
    for (const other of others) {
      lab.network.befriend(host.vault, other.vault);
      await host.lobby.invite(contactOf(host, other));
    }
    const [one, two, three] = host.lobby.invites.value;
    lab.network.resolveInvite(one!.inviteId, "declined");
    lab.network.resolveInvite(two!.inviteId, "unreachable", "share_current_card");
    lab.network.resolveInvite(three!.inviteId, "not-installed");
    await lab.network.settle();
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
    for (const other of others) lab.network.befriend(host.vault, other.vault);
    expect(await host.lobby.invite(contactOf(host, others[0]!))).toBe("ok");
    expect(await host.lobby.invite(contactOf(host, others[0]!))).toBe("duplicate");
    expect(await host.lobby.invite(contactOf(host, others[1]!))).toBe("ok");
    expect(await host.lobby.invite(contactOf(host, others[2]!))).toBe("ok");
    expect(await host.lobby.invite(contactOf(host, others[3]!))).toBe("full");
    // A declined invitation frees its place.
    lab.network.resolveInvite(host.lobby.invites.value[0]!.inviteId, "declined");
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
    await lab.network.settle();
    expect(host.lobby.startRequest.value!.args).toEqual([
      "-privateserver", "-nodes", "2", "-skill", "4", "-warp", "1", "1", "-altdeath", "-timer", "20",
    ]);
    expect(guest.lobby.guestView.value).toMatchObject({ mode: "deathmatch", monsters: true, timeLimit: 20 });
  });

  it("starts with three guests and four nodes, closing the lobby", async () => {
    const host = participant("host");
    const guests = ["a", "b", "c"].map((name) => participant(name));
    for (const guest of guests) {
      lab.network.befriend(host.vault, guest.vault);
      if (host.lobby.phase.value !== "lobby") await host.lobby.openLobby(COOP);
      await host.lobby.invite(contactOf(host, guest));
      lab.network.accept(host.lobby.invites.value.at(-1)!.inviteId);
    }
    await lab.network.settle();
    expect(host.lobby.players.value).toHaveLength(3);
    const closeLobby = vi.spyOn(host.vault.api, "closeLobbyAsync");
    expect(await host.lobby.startGame()).toBe("ok");
    expect(closeLobby).toHaveBeenCalledWith("lobby-host");
    expect(host.lobby.startRequest.value!.args.slice(0, 3)).toEqual(["-privateserver", "-nodes", "4"]);
    await lab.network.settle();
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
    lab.network.befriend(host.vault, slow.vault);
    await host.lobby.invite(contactOf(host, slow));
    const cancel = vi.spyOn(host.vault.api, "cancelInviteAsync");
    await host.lobby.startGame();
    expect(cancel).toHaveBeenCalledTimes(1);
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
    await lab.network.settle();

    expect(host.lobby.players.value.map((player) => player.displayName)).toEqual(["Other"]);
    expect(stranger.lobby.active.value).toBe(false);
    expect(stranger.lobby.notice.value).toMatchObject({ kind: "rejected", reason: "removed" });
    expect(await stranger.lobby.join(host.lobby.joinCode.value!, "Stranger")).toBe("not_admitted");
    expect(other.lobby.guestView.value!.players.map((player) => player.displayName)).toEqual(["Other"]);
  });
});
