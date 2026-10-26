import { describe, expect, it } from "vitest";
import { parseTimedemo } from "./timedemo";

describe("parseTimedemo", () => {
  it("reads the engine's report", () => {
    expect(parseTimedemo("timed 5166 gametics in 1230 realtics (147.000000 fps)")).toEqual({
      gametics: 5166,
      realtics: 1230,
      ticsPerSecond: 147,
    });
  });

  it("ignores other messages", () => {
    expect(parseTimedemo("Disconnected from the host.")).toBeNull();
    expect(parseTimedemo("timed lots of gametics")).toBeNull();
    expect(parseTimedemo("")).toBeNull();
  });
});
