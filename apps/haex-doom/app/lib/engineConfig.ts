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
