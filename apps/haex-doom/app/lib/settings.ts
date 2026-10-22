export const TOUCH_TURN_SENSITIVITY = { min: 0.25, max: 4, default: 1 } as const;

export interface ShellSettings {
  haptics: boolean;
  touchTurnSensitivity: number;
}

export const DEFAULT_SETTINGS: ShellSettings = {
  haptics: true,
  touchTurnSensitivity: TOUCH_TURN_SENSITIVITY.default,
};

/**
 * Reads stored settings; each field that is missing or invalid falls back to its default, so an
 * older or damaged value never breaks the start.
 */
export function parseSettings(text: string | null): ShellSettings {
  let value: unknown;
  try {
    value = text === null ? null : JSON.parse(text);
  } catch {
    value = null;
  }
  const stored = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  const sensitivity = stored.touchTurnSensitivity;
  return {
    haptics: typeof stored.haptics === "boolean" ? stored.haptics : DEFAULT_SETTINGS.haptics,
    touchTurnSensitivity:
      typeof sensitivity === "number" && sensitivity >= TOUCH_TURN_SENSITIVITY.min && sensitivity <= TOUCH_TURN_SENSITIVITY.max
        ? sensitivity
        : DEFAULT_SETTINGS.touchTurnSensitivity,
  };
}
