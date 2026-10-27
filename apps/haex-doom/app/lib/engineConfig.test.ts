import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ENGINE_CONFIG_VERSION, migrateEngineConfig, setConfigValue, widescreenFor, WIDESCREEN } from "./engineConfig";

describe("widescreenFor", () => {
  it("keeps 4:3 for areas narrower than 16:10", () => {
    expect(widescreenFor(1024, 768)).toBe(WIDESCREEN.off);
  });

  it("picks the widest ratio that fits", () => {
    expect(widescreenFor(1280, 800)).toBe(WIDESCREEN.ratio16x10);
    expect(widescreenFor(1920, 1080)).toBe(WIDESCREEN.ratio16x9);
    expect(widescreenFor(2560, 1080)).toBe(WIDESCREEN.ratio21x9);
  });

  it("falls back to 4:3 for an area without a size", () => {
    expect(widescreenFor(0, 0)).toBe(WIDESCREEN.off);
    expect(widescreenFor(800, Number.NaN)).toBe(WIDESCREEN.off);
  });
});

describe("setConfigValue", () => {
  it("replaces an existing value and keeps the other lines", () => {
    const text = "fullscreen                    0\ncrispy_widescreen             1\n";
    expect(setConfigValue(text, "crispy_widescreen", 3)).toBe(
      "fullscreen                    0\ncrispy_widescreen             3\n",
    );
  });

  it("does not match a name that only starts with the wanted one", () => {
    const text = "crispy_widescreen_x           1\n";
    expect(setConfigValue(text, "crispy_widescreen", 2)).toBe(
      "crispy_widescreen_x           1\ncrispy_widescreen             2\n",
    );
  });

  it("appends to a file without a trailing newline", () => {
    expect(setConfigValue("novert 1", "grabmouse", 0)).toBe("novert 1\ngrabmouse                     0\n");
  });
});

const shipped = (name: string) => readFileSync(fileURLToPath(new URL(`../../engine/config/${name}`, import.meta.url)), "utf8");

describe("shipped jump defaults", () => {
  it("turns jumping on, on Space (DOS scan code 57) and the pad's Y", () => {
    expect(shipped("crispy-doom.cfg")).toMatch(/^crispy_jump\s+1$/m);
    expect(shipped("default.cfg")).toMatch(/^key_jump\s+57$/m);
    expect(shipped("default.cfg")).toMatch(/^joyb_jump\s+6$/m);
  });

  it("leaves Space free for nothing else: no other key variable uses scan code 57", () => {
    const keyLines = shipped("default.cfg").split("\n").filter((l) => /^key_/.test(l) && !l.startsWith("key_jump"));
    expect(keyLines.filter((l) => /\s57$/.test(l))).toEqual([]);
  });

  it("migrates to what the shipped config says", () => {
    const old = "key_jump                      53\njoyb_jump                     -1\n";
    const migrated = migrateEngineConfig("default.cfg", old, 0);
    expect(migrated).toMatch(/^key_jump\s+57$/m);
    expect(migrated).toMatch(/^joyb_jump\s+6$/m);
  });
});

describe("shipped keyboard default", () => {
  it("lets typed letters follow the keyboard layout (the engine's own default is the US layout)", () => {
    expect(shipped("crispy-doom.cfg")).toMatch(/^vanilla_keyboard_mapping\s+0$/m);
    expect(migrateEngineConfig("crispy-doom.cfg", "vanilla_keyboard_mapping      1\n", 0)).toMatch(/^vanilla_keyboard_mapping\s+0$/m);
    expect(migrateEngineConfig("crispy-doom.cfg", "crispy_hires                  1\n", 0)).toMatch(/^vanilla_keyboard_mapping\s+0$/m);
  });
});

describe("migrateEngineConfig", () => {
  const stored = "crispy_hires                  1\ncrispy_jump                   0\nvanilla_keyboard_mapping      0\n";

  it("turns on jumping in a config stored before it was a default", () => {
    expect(migrateEngineConfig("crispy-doom.cfg", stored, 0)).toBe("crispy_hires                  1\ncrispy_jump                   1\nvanilla_keyboard_mapping      0\n");
  });

  it("adds a setting the stored file does not have", () => {
    expect(migrateEngineConfig("default.cfg", "key_use                       18\n", 0)).toContain("key_jump                      57");
  });

  it("keeps a value the player chose, such as high jumps or another key", () => {
    expect(migrateEngineConfig("crispy-doom.cfg", "crispy_jump                   2\n", 0)).toMatch(/^crispy_jump\s+2$/m);
    expect(migrateEngineConfig("default.cfg", "key_jump                      30\n", 0)).toContain("key_jump                      30");
  });

  it("does nothing for a config that is already up to date, and for files it knows nothing about", () => {
    expect(migrateEngineConfig("crispy-doom.cfg", stored, ENGINE_CONFIG_VERSION)).toBe(stored);
    expect(migrateEngineConfig("other.cfg", stored, 0)).toBe(stored);
  });
});
