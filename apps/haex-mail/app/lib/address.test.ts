import { describe, expect, it } from "vitest";
import { parseAddressList } from "./address";

describe("parseAddressList", () => {
  it("parses bare addresses separated by commas or semicolons", () => {
    expect(parseAddressList(" a@x.de, b@y.de; c@z.de ,")).toEqual({
      addresses: [{ email: "a@x.de" }, { email: "b@y.de" }, { email: "c@z.de" }],
      invalid: [],
    });
  });

  it("parses display names", () => {
    expect(parseAddressList("Max Muster <max@x.de>").addresses).toEqual([
      { name: "Max Muster", email: "max@x.de" },
    ]);
  });

  it("keeps commas inside quoted display names", () => {
    expect(parseAddressList('"Doe, John" <j@x.de>, "A \\"B\\"" <ab@x.de>').addresses).toEqual([
      { name: "Doe, John", email: "j@x.de" },
      { name: 'A "B"', email: "ab@x.de" },
    ]);
  });

  it("reports what isn't an address", () => {
    expect(parseAddressList("max, <>, a@x.de, x@y z").invalid).toEqual(["max", "<>", "x@y z"]);
  });
});
