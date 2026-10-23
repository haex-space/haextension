import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid stored values", () => {
    expect(parseSettings('{"haptics":false,"touchTurnSensitivity":2.5}')).toEqual({
      haptics: false,
      touchTurnSensitivity: 2.5,
    });
  });

  it("replaces each invalid field with its default", () => {
    expect(parseSettings('{"haptics":"no","touchTurnSensitivity":99}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"haptics":false,"touchTurnSensitivity":"fast"}')).toEqual({
      haptics: false,
      touchTurnSensitivity: DEFAULT_SETTINGS.touchTurnSensitivity,
    });
  });

  it("survives text that is not JSON or not an object", () => {
    expect(parseSettings("{broken")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("[1,2]")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
  });
});
