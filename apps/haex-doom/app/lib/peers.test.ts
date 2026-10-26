import { describe, expect, it, vi } from "vitest";
import { FakeNetwork } from "./peersFake.testing";
import { createPeerSession, isUnknownMethod, probePeers, type PeersApi } from "./peers";

/** Two vaults with an open channel between them: `hostSide` belongs to the first, `guestSide` to the second. */
async function connected() {
  const network = new FakeNetwork();
  const host = network.vault("host");
  const guest = network.vault("guest");
  network.befriend(host, guest);
  const { joinCode } = await host.api.openLobbyAsync("lobby", "contacts");
  let hostSide = "";
  host.api.on("joined", (event) => (hostSide = event.channelId));
  const { channelId: guestSide } = await guest.api.joinAsync(joinCode, "Guest", {});
  await network.settle();
  return { network, host, guest, hostSide, guestSide };
}

const packet = (...bytes: number[]) => new Uint8Array(bytes);

describe("peer numbers", () => {
  it("numbers the channels of a host from 1 in order and keeps them", async () => {
    const { host, hostSide } = await connected();
    const session = createPeerSession(host.api);
    expect(session.register(hostSide)).toBe(1);
    expect(session.register("another")).toBe(2);
    expect(session.register(hostSide)).toBe(1);
    expect(session.peerOf("another")).toBe(2);
  });

  it("resolves the host's address name to the number of the host channel", async () => {
    const { guest, guestSide } = await connected();
    const session = createPeerSession(guest.api);
    const imports = session.imports();
    expect(imports.netResolve("host")).toBe(-1);
    session.setHost(guestSide);
    expect(imports.netResolve("host")).toBe(1);
    expect(imports.netResolve("somebody")).toBe(-1);
  });

  it("starts again at 1 after a reset", async () => {
    const { guest, guestSide } = await connected();
    const session = createPeerSession(guest.api);
    session.register("old");
    session.reset();
    session.setHost(guestSide);
    expect(session.imports().netResolve("host")).toBe(1);
  });
});

describe("sending datagrams", () => {
  it("sends the packet unreliably on the peer's channel", async () => {
    const { network, host, hostSide } = await connected();
    const session = createPeerSession(host.api);
    const peer = session.register(hostSide);
    session.imports().netSend(peer, packet(1, 2, 3));
    await network.settle();
    expect(network.sent.at(-1)).toMatchObject({ from: "host", to: "guest", reliable: false });
    expect([...network.sent.at(-1)!.data]).toEqual([1, 2, 3]);
  });

  it("sends a copy, so the engine can reuse its buffer", async () => {
    const { network, host, hostSide } = await connected();
    const session = createPeerSession(host.api);
    const peer = session.register(hostSide);
    const buffer = packet(7, 7);
    session.imports().netSend(peer, buffer);
    buffer.fill(0);
    expect([...network.sent.at(-1)!.data]).toEqual([7, 7]);
  });

  it("drops packets for unknown peers and over the vault's limit without throwing", async () => {
    const { host, hostSide } = await connected();
    const session = createPeerSession(host.api);
    const peer = session.register(hostSide);
    const send = session.imports().netSend;
    expect(() => send(99, packet(1))).not.toThrow();
    expect(() => send(peer, new Uint8Array(1025))).not.toThrow();
    expect(session.stats.dropped).toBe(2);
  });

  it("counts failed sends and never throws into the engine", async () => {
    const { network, host, hostSide } = await connected();
    const session = createPeerSession({ ...host.api, sendAsync: () => Promise.reject(new Error("channel_closed")) });
    const peer = session.register(hostSide);
    expect(() => session.imports().netSend(peer, packet(1))).not.toThrow();
    await network.settle();
    expect(session.stats.sendErrors).toBe(1);
  });

  it("drops packets for a channel that has closed", async () => {
    const { network, host, hostSide } = await connected();
    const session = createPeerSession(host.api);
    const peer = session.register(hostSide);
    network.close(hostSide);
    await network.settle();
    session.imports().netSend(peer, packet(1));
    expect(session.stats.dropped).toBe(1);
  });
});

describe("receiving datagrams", () => {
  it("hands out packets with the peer number as 4-byte little-endian prefix", async () => {
    const { network, host, guest, hostSide, guestSide } = await connected();
    const receiving = createPeerSession(host.api);
    const peer = receiving.register("unused");
    expect(peer).toBe(1);
    const second = receiving.register(hostSide);
    const sender = createPeerSession(guest.api);
    sender.register(guestSide);
    sender.imports().netSend(1, packet(9, 8, 7));
    await network.settle();

    const target = new Uint8Array(64);
    const length = receiving.imports().netRecv(target);
    expect(length).toBe(7);
    expect([...target.subarray(0, 7)]).toEqual([second, 0, 0, 0, 9, 8, 7]);
    expect(receiving.imports().netRecv(target)).toBe(0);
  });

  it("keeps packets that arrive before the netgame begins", async () => {
    const { network, host, guest, hostSide, guestSide } = await connected();
    const receiving = createPeerSession(host.api);
    receiving.register(hostSide);
    const sender = createPeerSession(guest.api);
    sender.register(guestSide);
    sender.imports().netSend(1, packet(1));
    await network.settle();
    receiving.beginNetgame();
    expect(receiving.imports().netRecv(new Uint8Array(16))).toBe(5);
  });

  it("ignores packets of channels it does not know", async () => {
    const { network, host, guest, guestSide } = await connected();
    const receiving = createPeerSession(host.api);
    const sender = createPeerSession(guest.api);
    sender.register(guestSide);
    sender.imports().netSend(1, packet(1));
    await network.settle();
    expect(receiving.imports().netRecv(new Uint8Array(16))).toBe(0);
  });

  it("drops the oldest packets when the engine falls behind", async () => {
    const { network, host, guest, hostSide, guestSide } = await connected();
    const receiving = createPeerSession(host.api);
    receiving.register(hostSide);
    const sender = createPeerSession(guest.api);
    sender.register(guestSide);
    for (let index = 0; index < 300; index++) sender.imports().netSend(1, packet(index % 256));
    await network.settle();

    const target = new Uint8Array(16);
    let count = 0;
    let first = -1;
    for (let length = receiving.imports().netRecv(target); length > 0; length = receiving.imports().netRecv(target)) {
      if (count++ === 0) first = target[4]!;
    }
    expect(count).toBe(256);
    expect(first).toBe(44);
    expect(receiving.stats.dropped).toBe(44);
  });

  it("skips a packet that does not fit the engine's buffer", async () => {
    const { network, host, guest, hostSide, guestSide } = await connected();
    const receiving = createPeerSession(host.api);
    receiving.register(hostSide);
    const sender = createPeerSession(guest.api);
    sender.register(guestSide);
    sender.imports().netSend(1, new Uint8Array(100));
    sender.imports().netSend(1, packet(5));
    await network.settle();
    const target = new Uint8Array(16);
    expect(receiving.imports().netRecv(target)).toBe(5);
    expect(target[4]).toBe(5);
  });

  it("clears the queue when the netgame ends", async () => {
    const { network, host, guest, hostSide, guestSide } = await connected();
    const receiving = createPeerSession(host.api);
    receiving.register(hostSide);
    const sender = createPeerSession(guest.api);
    sender.register(guestSide);
    sender.imports().netSend(1, packet(1));
    await network.settle();
    receiving.beginNetgame();
    receiving.endNetgame();
    expect(receiving.imports().netRecv(new Uint8Array(16))).toBe(0);
  });
});

describe("netActive", () => {
  it("is true from the start of a netgame until it ends or the session resets", async () => {
    const { host } = await connected();
    const session = createPeerSession(host.api);
    const imports = session.imports();
    expect(imports.netActive()).toBe(false);
    session.beginNetgame();
    expect(imports.netActive()).toBe(true);
    session.endNetgame();
    expect(imports.netActive()).toBe(false);
    session.beginNetgame();
    session.reset();
    expect(imports.netActive()).toBe(false);
  });
});

describe("reliable messages and closing channels", () => {
  it("forwards reliable messages, not queueing them for the engine", async () => {
    const { network, host, guest, hostSide, guestSide } = await connected();
    const session = createPeerSession(host.api);
    session.register(hostSide);
    const seen: [string, number[]][] = [];
    session.onReliable((channelId, data) => seen.push([channelId, [...data]]));
    await guest.api.sendAsync(guestSide, packet(4, 2), { reliable: true });
    await network.settle();
    expect(seen).toEqual([[hostSide, [4, 2]]]);
    expect(session.imports().netRecv(new Uint8Array(16))).toBe(0);
  });

  it("tells the engine a peer is gone only during a netgame", async () => {
    const { network, host, hostSide } = await connected();
    const gone = vi.fn();
    const session = createPeerSession(host.api, { peerGone: gone });
    session.register(hostSide);
    network.close(hostSide);
    await network.settle();
    expect(gone).not.toHaveBeenCalled();

    const second = await connected();
    const during = createPeerSession(second.host.api, { peerGone: gone });
    const number = during.register(second.hostSide);
    during.beginNetgame();
    second.network.close(second.hostSide);
    await second.network.settle();
    expect(gone).toHaveBeenCalledExactlyOnceWith(number);
  });

  it("tells a running netgame that every peer is gone when the session resets", async () => {
    const { host, hostSide } = await connected();
    const gone = vi.fn();
    const session = createPeerSession(host.api, { peerGone: gone });
    session.register(hostSide);
    session.register("second");
    session.beginNetgame();
    session.reset();
    expect(gone.mock.calls).toEqual([[1], [2]]);
    session.reset();
    expect(gone).toHaveBeenCalledTimes(2);
  });

  it("reports closed channels to the lobby and forgets their number", async () => {
    const { network, host, hostSide } = await connected();
    const session = createPeerSession(host.api);
    session.register(hostSide);
    const closed: [string, string][] = [];
    session.onClosed((channelId, reason) => closed.push([channelId, reason]));
    network.drop(hostSide, "timeout");
    await network.settle();
    expect(closed).toEqual([[hostSide, "timeout"]]);
    expect(session.peerOf(hostSide)).toBeUndefined();
  });

  it("stops listening when disposed", async () => {
    const { network, host, guest, hostSide, guestSide } = await connected();
    const session = createPeerSession(host.api);
    session.register(hostSide);
    const handler = vi.fn();
    session.onReliable(handler);
    session.dispose();
    await guest.api.sendAsync(guestSide, packet(1), { reliable: true });
    await network.settle();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("probePeers", () => {
  const failing = (error: unknown) => ({ closeLobbyAsync: () => Promise.reject(error) }) as unknown as PeersApi;

  it("is unavailable without client.peers", async () => {
    expect(await probePeers(undefined)).toBe("unavailable");
  });

  it("is available when the call succeeds", async () => {
    const network = new FakeNetwork();
    expect(await probePeers(network.vault("a").api)).toBe("available");
  });

  it("is unavailable when the host does not know the method", async () => {
    expect(await probePeers(failing({ code: 1001, message: "Unknown method: extension_peers_lobby_close" }))).toBe("unavailable");
    expect(await probePeers(failing(new Error("Unknown method")))).toBe("unavailable");
  });

  it("stays unknown while a permission prompt is open, so it can be asked again", async () => {
    expect(await probePeers(failing({ code: 1004, message: "prompt" }))).toBe("unknown");
  });

  it("is unavailable after a refused permission", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await probePeers(failing({ code: 1002, message: "denied" }))).toBe("unavailable");
  });
});

describe("isUnknownMethod", () => {
  it("does not mistake a named peer error for an unknown method", () => {
    expect(isUnknownMethod({ code: 1001, reason: "lobby_closed" })).toBe(false);
    expect(isUnknownMethod({ code: 1001 })).toBe(true);
    expect(isUnknownMethod(new Error("boom"))).toBe(false);
  });
});
