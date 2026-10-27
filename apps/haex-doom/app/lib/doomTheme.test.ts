import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const css = readFileSync(here("../assets/css/doom-theme.css"), "utf8");

/** The custom properties of the first rule that sets the palette, with `var(--x)` references resolved. */
function palette(): Map<string, string> {
  const rule = /:root,\s*:root\.dark,\s*\.dark\s*\{([^}]*)\}/.exec(css);
  if (!rule) throw new Error("palette rule not found");
  const raw = new Map<string, string>();
  for (const [, name, value] of rule[1]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) raw.set(name!, value!.trim());
  const resolve = (value: string): string => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    return ref ? resolve(raw.get(ref[1]!)!) : value;
  };
  return new Map([...raw].map(([name, value]) => [name, resolve(value)]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe("doom theme palette", () => {
  const colors = palette();
  const color = (name: string) => {
    const value = colors.get(name);
    if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex colour: ${value}`);
    return value;
  };

  const TEXT_ON: [string, string][] = [
    ["--foreground", "--background"],
    ["--card-foreground", "--card"],
    ["--popover-foreground", "--popover"],
    ["--muted-foreground", "--background"],
    ["--muted-foreground", "--card"],
    ["--muted-foreground", "--popover"],
    ["--muted-foreground", "--muted"],
    ["--primary-foreground", "--primary"],
    ["--secondary-foreground", "--secondary"],
    ["--accent-foreground", "--accent"],
    ["--destructive", "--card"],
    ["--destructive", "--popover"],
    ["--destructive-foreground", "--destructive"],
    ["--doom-bone", "--doom-plate-top"],
    ["--doom-bone", "--doom-plate-bottom"],
    ["--doom-amber", "--doom-plate-top"],
    ["--doom-amber", "--doom-abyss"],
    ["--doom-tan", "--doom-abyss"],
  ];

  it.each(TEXT_ON)("keeps %s on %s at 4.5:1 or better", (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("does not depend on the vault theme", () => {
    expect(css).toMatch(/color-scheme:\s*dark/);
  });
});

describe("doom theme assets", () => {
  it("bundles a small font with its licence", () => {
    expect(statSync(here("../assets/fonts/anton-latin-400.woff2")).size).toBeLessThan(40 * 1024);
    expect(readFileSync(here("../../engine/licenses/anton-OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});
