/** Values of `crispy_widescreen` (RATIO_* in upstream src/crispy.h). */
export const WIDESCREEN = { off: 0, ratio16x10: 2, ratio16x9: 3, ratio21x9: 4 } as const;

/**
 * The widest ratio that still fits the game area. Crispy's own "match screen" setting follows
 * the monitor, but the game runs in a tab of any shape (FR-007).
 */
export function widescreenFor(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return WIDESCREEN.off;
  const ratio = width / height;
  if (ratio >= 21 / 9) return WIDESCREEN.ratio21x9;
  if (ratio >= 16 / 9) return WIDESCREEN.ratio16x9;
  if (ratio >= 16 / 10) return WIDESCREEN.ratio16x10;
  return WIDESCREEN.off;
}

/** Sets `name` in a config file's text ("name value" per line), replacing or appending it. */
export function setConfigValue(text: string, name: string, value: string | number): string {
  const line = `${name.padEnd(30)}${value}`;
  const lines = text.split("\n");
  const index = lines.findIndex((l) => l.split(/\s+/, 1)[0] === name);
  if (index >= 0) {
    lines[index] = line;
    return lines.join("\n");
  }
  const body = text.endsWith("\n") || text === "" ? text : `${text}\n`;
  return `${body}${line}\n`;
}

/** Version of the defaults in engine/config/*.cfg that a stored config has been brought up to. */
export const ENGINE_CONFIG_VERSION = 1;

interface ConfigChange {
  /** The value the setting had in the default config before this version (the engine's own default); only a stored config still at it is changed. */
  from: string;
  to: string;
}

/**
 * Settings whose shipped default changed, per config file and version. A stored config would
 * otherwise keep the old value for good, because the engine writes every setting back when it
 * quits. A setting the player moved off the old default is left alone. Keep the values in line
 * with engine/config/*.cfg.
 */
const CONFIG_CHANGES: Record<number, Record<string, Record<string, ConfigChange>>> = {
  // Jumping on Space (crispy_jump 1 = low jump; key_jump 57 is Space as a DOS scan code; joyb_jump 6 is the pad's Y).
  1: {
    "crispy-doom.cfg": { crispy_jump: { from: "0", to: "1" } },
    "default.cfg": { key_jump: { from: "53", to: "57" }, joyb_jump: { from: "-1", to: "6" } },
  },
};

function configValue(text: string, name: string): string | undefined {
  const line = text.split("\n").find((l) => l.split(/\s+/, 1)[0] === name);
  return line?.slice(name.length).trim();
}

/**
 * Brings a stored config file up to the current defaults: applies the changes of every version
 * after `storedVersion` to the settings that still have their old default. A setting missing
 * from the file counts as having it (the engine then uses its own default, which is the old one).
 */
export function migrateEngineConfig(fileName: string, text: string, storedVersion: number): string {
  let result = text;
  for (let version = storedVersion + 1; version <= ENGINE_CONFIG_VERSION; version++) {
    for (const [name, change] of Object.entries(CONFIG_CHANGES[version]?.[fileName] ?? {})) {
      const current = configValue(result, name);
      if (current === undefined || current === change.from) result = setConfigValue(result, name, change.to);
    }
  }
  return result;
}
