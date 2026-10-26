import { describe, expect, it, vi } from "vitest";
import { DEATHMATCH, contactOf, invited, joinedByCode, lab, participant, useLobbyLab } from "./lobbyHarness.testing";

useLobbyLab();

describe("leaving", () => {
  it("lets a guest leave the lobby; the others see the new list", async () => {
    const host = participant("host");
    const a = participant("a");
    const b = participant("b");
    await host.lobby.openLobby(DEATHMATCH);
    await joinedByCode(host, a, "A");
    await joinedByCode(host, b, "B");
    await a.lobby.leave();
    await lab.network.settle();
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
    await lab.network.settle();

    await a.lobby.engineStopped();
    await lab.network.settle();

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
    await lab.network.settle();

    await host.lobby.engineStopped();
    await lab.network.settle();

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
    lab.network.befriend(host.vault, pending.vault);
    await host.lobby.invite(contactOf(host, pending));
    const cancel = vi.spyOn(host.vault.api, "cancelInviteAsync");
    const closeLobby = vi.spyOn(host.vault.api, "closeLobbyAsync");

    await host.lobby.leave();
    await lab.network.settle();

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
    await lab.network.settle();

    lab.network.drop(host.lobby.players.value[0]!.channelId, "timeout");
    await lab.network.settle();

    expect(guest.lobby.notice.value).toMatchObject({ kind: "connection-lost" });
    expect(guest.lobby.active.value).toBe(false);
    expect(host.lobby.notice.value).toMatchObject({ kind: "guest-left", name: "Anna" });
    expect(host.lobby.phase.value).toBe("running");
  });
});
