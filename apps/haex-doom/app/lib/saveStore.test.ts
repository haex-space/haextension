import { describe, expect, it } from "vitest";
import { parseSavePath, saveDescription, saveId, savePath } from "./saveStore";

const FINGERPRINT = "1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771";

describe("parseSavePath", () => {
  it("reads game and slot from the engine's save path", () => {
    expect(parseSavePath(savePath(FINGERPRINT, 3))).toEqual({ fingerprint: FINGERPRINT, slot: 3 });
  });

  it("accepts the doubled slash the engine writes after the save directory", () => {
    expect(parseSavePath(`/saves/${FINGERPRINT}//doomsav0.dsg`)).toEqual({ fingerprint: FINGERPRINT, slot: 0 });
  });

  it("reads slots on the save menu's later pages", () => {
    expect(parseSavePath(`/saves/${FINGERPRINT}//doomsav11.dsg`)).toEqual({ fingerprint: FINGERPRINT, slot: 11 });
    expect(parseSavePath(`/saves/${FINGERPRINT}//doomsav77.dsg`)).toEqual({ fingerprint: FINGERPRINT, slot: 77 });
  });

  it("ignores other files and slots outside the menu's pages", () => {
    expect(parseSavePath("/config/default.cfg")).toBeNull();
    expect(parseSavePath(`/saves/${FINGERPRINT}/temp.dsg`)).toBeNull();
    expect(parseSavePath(`/saves/${FINGERPRINT}/doomsav8.dsg`)).toBeNull();
    expect(parseSavePath(`/saves/${FINGERPRINT}/doomsav80.dsg`)).toBeNull();
    expect(parseSavePath("/saves/not-a-fingerprint/doomsav1.dsg")).toBeNull();
  });
});

describe("saveDescription", () => {
  it("reads the name up to the first NUL", () => {
    const data = new Uint8Array(64);
    data.set(new TextEncoder().encode("E1M2 SECRET ROOM"));
    expect(saveDescription(data)).toBe("E1M2 SECRET ROOM");
  });

  it("stops at the header length when there is no NUL", () => {
    const data = new TextEncoder().encode("A".repeat(40));
    expect(saveDescription(data)).toBe("A".repeat(24));
  });
});

describe("saveId", () => {
  it("is the same for the same game and slot on every device", () => {
    expect(saveId(FINGERPRINT, 5)).toBe(`${FINGERPRINT}:5`);
  });
});
