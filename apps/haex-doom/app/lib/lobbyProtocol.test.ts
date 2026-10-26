import { describe, expect, it } from "vitest";
import {
  checkCompatibility,
  cleanName,
  decodeMessage,
  encodeMessage,
  guestArguments,
  hostArguments,
  parseInvitePayload,
  parseJoinPayload,
  warpArguments,
} from "./lobbyProtocol";

const FINGERPRINT = "1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771";
const GAME = { title: "DOOM (shareware)", fingerprint: FINGERPRINT };

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

const deathmatch = { mode: "deathmatch", monsters: false, timeLimit: 10, map: "E1M1", skill: 3 };

const invitation = {
  v: 1,
  lobbyId: "5b0d6a5e-9d1c-4a3e-8c1f-2f6f3a1b7c10",
  game: GAME,
  ...deathmatch,
  visibility: "contacts",
  extensionVersion: "1.0.0",
};

describe("encodeMessage and decodeMessage", () => {
  it("round-trips every message type", () => {
    const messages = [
      { t: "hello", fingerprint: FINGERPRINT, extensionVersion: "1.0.0", displayName: "Anna" },
      { t: "lobby", game: GAME, ...deathmatch, players: [{ displayName: "Ben", verified: true, state: "joined" }] },
      { t: "reject", reason: "version" },
      { t: "start", nodes: 3, mode: "coop", map: "E2M4", skill: 4 },
      { t: "leave" },
    ] as const;
    for (const message of messages) {
      expect(decodeMessage(encodeMessage(message))).toEqual({ ...message, v: 1 });
    }
  });

  it("adds the protocol version", () => {
    expect(JSON.parse(new TextDecoder().decode(encodeMessage({ t: "leave" })))).toEqual({ t: "leave", v: 1 });
  });
});

describe("decodeMessage", () => {
  it("ignores unknown types and other versions", () => {
    expect(decodeMessage(bytes({ t: "dance", v: 1 }))).toBeNull();
    expect(decodeMessage(bytes({ t: "leave", v: 2 }))).toBeNull();
    expect(decodeMessage(bytes({ t: "leave" }))).toBeNull();
  });

  it("rejects bytes that are not a JSON object", () => {
    expect(decodeMessage(new Uint8Array())).toBeNull();
    expect(decodeMessage(new TextEncoder().encode("{nope"))).toBeNull();
    expect(decodeMessage(new Uint8Array([0xff, 0xfe]))).toBeNull();
    expect(decodeMessage(bytes([1, 2]))).toBeNull();
    expect(decodeMessage(bytes(null))).toBeNull();
    expect(decodeMessage(new Uint8Array(9 * 1024).fill(0x20))).toBeNull();
  });

  it("validates hello", () => {
    const hello = { t: "hello", v: 1, fingerprint: FINGERPRINT, extensionVersion: "1.0.0", displayName: "Anna" };
    expect(decodeMessage(bytes(hello))).toEqual(hello);
    expect(decodeMessage(bytes({ ...hello, fingerprint: "abc" }))).toBeNull();
    expect(decodeMessage(bytes({ ...hello, displayName: "" }))).toBeNull();
    expect(decodeMessage(bytes({ ...hello, displayName: "x".repeat(65) }))).toBeNull();
    expect(decodeMessage(bytes({ ...hello, extensionVersion: 1 }))).toBeNull();
  });

  it("validates reject reasons", () => {
    for (const reason of ["game-missing", "version", "full", "removed"]) {
      expect(decodeMessage(bytes({ t: "reject", v: 1, reason }))).toEqual({ t: "reject", v: 1, reason });
    }
    expect(decodeMessage(bytes({ t: "reject", v: 1, reason: "because" }))).toBeNull();
    expect(decodeMessage(bytes({ t: "reject", v: 1 }))).toBeNull();
  });

  describe("start", () => {
    const start = { t: "start", v: 1, nodes: 2, mode: "coop", map: "MAP07", skill: 2 };

    it("accepts two to four nodes only", () => {
      expect(decodeMessage(bytes(start))).toEqual(start);
      expect(decodeMessage(bytes({ ...start, nodes: 4 }))).not.toBeNull();
      expect(decodeMessage(bytes({ ...start, nodes: 1 }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, nodes: 5 }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, nodes: 2.5 }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, nodes: "3" }))).toBeNull();
    });

    it("allows deathmatch options only for deathmatch", () => {
      expect(decodeMessage(bytes({ ...start, monsters: false }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, timeLimit: 10 }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, ...deathmatch }))).toEqual({ ...start, ...deathmatch });
    });

    it("requires both deathmatch options with deathmatch", () => {
      expect(decodeMessage(bytes({ ...start, mode: "deathmatch" }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, ...deathmatch, monsters: undefined }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, ...deathmatch, timeLimit: 15 }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, ...deathmatch, timeLimit: 0 }))).not.toBeNull();
    });

    it("validates map and skill", () => {
      expect(decodeMessage(bytes({ ...start, map: "E5M1" }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, map: "MAP33" }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, map: "MAP00" }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, map: "../../etc" }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, skill: 0 }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, skill: 6 }))).toBeNull();
      expect(decodeMessage(bytes({ ...start, mode: "teamplay" }))).toBeNull();
    });
  });

  describe("lobby", () => {
    const lobby = { t: "lobby", v: 1, game: GAME, mode: "coop", map: "E1M1", skill: 3, players: [] };

    it("validates the game and the players", () => {
      expect(decodeMessage(bytes(lobby))).toEqual(lobby);
      expect(decodeMessage(bytes({ ...lobby, game: { title: "x", fingerprint: "nope" } }))).toBeNull();
      expect(decodeMessage(bytes({ ...lobby, game: undefined }))).toBeNull();
      expect(decodeMessage(bytes({ ...lobby, players: "none" }))).toBeNull();
      expect(decodeMessage(bytes({ ...lobby, players: [{ displayName: "A", verified: "yes", state: "joined" }] }))).toBeNull();
      expect(decodeMessage(bytes({ ...lobby, players: [{ displayName: "A", verified: true, state: "gone" }] }))).toBeNull();
    });

    it("allows at most three guests", () => {
      const guest = { displayName: "A", verified: false, state: "joined" };
      expect(decodeMessage(bytes({ ...lobby, players: [guest, guest, guest] }))).not.toBeNull();
      expect(decodeMessage(bytes({ ...lobby, players: [guest, guest, guest, guest] }))).toBeNull();
    });
  });
});

describe("parseInvitePayload", () => {
  it("accepts the invitation of the contract", () => {
    expect(parseInvitePayload(invitation)).toEqual(invitation);
  });

  it("accepts cooperative invitations without deathmatch fields", () => {
    const coop = { ...invitation, mode: "coop", monsters: undefined, timeLimit: undefined };
    expect(parseInvitePayload(coop)).toMatchObject({ mode: "coop" });
    expect(parseInvitePayload({ ...coop, monsters: true })).toBeNull();
  });

  it("rejects what is not a version-1 invitation", () => {
    expect(parseInvitePayload(null)).toBeNull();
    expect(parseInvitePayload("hello")).toBeNull();
    expect(parseInvitePayload({ ...invitation, v: 2 })).toBeNull();
    expect(parseInvitePayload({ ...invitation, lobbyId: "a b" })).toBeNull();
    expect(parseInvitePayload({ ...invitation, visibility: "friends" })).toBeNull();
    expect(parseInvitePayload({ ...invitation, extensionVersion: undefined })).toBeNull();
    expect(parseInvitePayload({ ...invitation, game: undefined })).toBeNull();
  });
});

describe("parseJoinPayload", () => {
  it("reads the version of the joining extension", () => {
    expect(parseJoinPayload({ v: 1, extensionVersion: "1.0.0" })).toEqual({ v: 1, extensionVersion: "1.0.0" });
    expect(parseJoinPayload({ v: 1 })).toBeNull();
    expect(parseJoinPayload({ v: 3, extensionVersion: "1.0.0" })).toBeNull();
    expect(parseJoinPayload(undefined)).toBeNull();
  });
});

describe("checkCompatibility", () => {
  const local = [{ fingerprint: "other" }, { fingerprint: FINGERPRINT }];

  it("is ok with the same game and version", () => {
    expect(checkCompatibility(invitation, local, "1.0.0")).toBe("ok");
  });

  it("names a missing game before a different version", () => {
    expect(checkCompatibility(invitation, [{ fingerprint: "other" }], "2.0.0")).toBe("game-missing");
    expect(checkCompatibility(invitation, [], "1.0.0")).toBe("game-missing");
  });

  it("names a different version", () => {
    expect(checkCompatibility(invitation, local, "1.0.1")).toBe("version");
  });
});

describe("engine arguments", () => {
  it("warps DOOM 1 maps by episode and map digit and DOOM II maps by number", () => {
    expect(warpArguments("E2M4")).toEqual(["-warp", "2", "4"]);
    expect(warpArguments("MAP07")).toEqual(["-warp", "7"]);
    expect(warpArguments("MAP32")).toEqual(["-warp", "32"]);
  });

  it("starts a cooperative host without deathmatch options", () => {
    expect(hostArguments({ mode: "coop", map: "E1M1", skill: 3 }, 2)).toEqual([
      "-privateserver", "-nodes", "2", "-skill", "3", "-warp", "1", "1",
    ]);
  });

  it("starts a deathmatch host with the 2.0 rules, no monsters and the time limit", () => {
    expect(hostArguments({ mode: "deathmatch", monsters: false, timeLimit: 10, map: "MAP01", skill: 4 }, 4)).toEqual([
      "-privateserver", "-nodes", "4", "-skill", "4", "-warp", "1", "-altdeath", "-nomonsters", "-timer", "10",
    ]);
  });

  it("leaves monsters on and the time limit off when asked", () => {
    expect(hostArguments({ mode: "deathmatch", monsters: true, timeLimit: 0, map: "E1M1", skill: 3 }, 2)).toEqual([
      "-privateserver", "-nodes", "2", "-skill", "3", "-warp", "1", "1", "-altdeath",
    ]);
    expect(hostArguments({ mode: "deathmatch", monsters: true, timeLimit: 20, map: "E1M1", skill: 3 }, 2)).toContain("20");
  });

  it("connects a guest to the host's address name", () => {
    expect(guestArguments()).toEqual(["-connect", "host"]);
  });
});

describe("cleanName", () => {
  it("removes control characters, trims and shortens", () => {
    expect(cleanName("  Anna\u0000\n ")).toBe("Anna");
    expect(cleanName("x".repeat(40))).toHaveLength(32);
    expect(cleanName("\u0007")).toBe("");
  });
});
