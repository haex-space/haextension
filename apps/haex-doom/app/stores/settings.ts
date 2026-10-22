export const TOUCH_TURN_SENSITIVITY = { min: 0.25, max: 4, default: 1 } as const;

/** Shell settings; the engine's own options (volumes, mouse) live in its config files. */
export const useSettingsStore = defineStore("settings", () => {
  const haptics = ref(true);
  const touchTurnSensitivity = ref<number>(TOUCH_TURN_SENSITIVITY.default);

  /** Short vibration on fire (kind 0) and damage (kind 1), FR-014. */
  function vibrate(kind: number) {
    if (!haptics.value || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(kind === 0 ? 15 : 40);
  }

  return { haptics, touchTurnSensitivity, vibrate };
});
