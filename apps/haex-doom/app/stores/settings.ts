import { ENGINE_CONFIG_VERSION, migrateEngineConfig } from "~/lib/engineConfig";
import { DEFAULT_SETTINGS, parseSettings } from "~/lib/settings";

const SETTINGS_KEY = "settings";
/** The engine's config files, stored per device under `engine:<file name>`. */
const ENGINE_CONFIG_KEY = (fileName: string) => `engine:${fileName}`;
/** The version of the shipped defaults the stored engine configs have been brought up to (lib/engineConfig.ts). */
const ENGINE_CONFIG_VERSION_KEY = "engine-config-version";

/**
 * Shell settings and the engine's config files, kept on this device through the SDK's storage
 * (FR-017, FR-019): controls legitimately differ between a phone and a desktop.
 */
export const useSettingsStore = defineStore("settings", () => {
  const { $haexVault } = useNuxtApp();
  const storage = () => $haexVault.client.storage;

  const haptics = ref(DEFAULT_SETTINGS.haptics);
  const touchTurnSensitivity = ref(DEFAULT_SETTINGS.touchTurnSensitivity);
  let loaded: Promise<void> | null = null;
  let saving = false;

  function load(): Promise<void> {
    loaded ??= storage()
      .getItem(SETTINGS_KEY)
      .then((text) => {
        const settings = parseSettings(text);
        haptics.value = settings.haptics;
        touchTurnSensitivity.value = settings.touchTurnSensitivity;
      })
      .catch((error: unknown) => {
        // Without stored settings the defaults still give a working game; the next load tries again.
        console.error("[haex-doom] Could not load settings:", error);
        loaded = null;
      })
      .finally(() => {
        // Only after the first attempt, so loading does not write the stored values back, but
        // also after a failed one, so the player's changes are still kept.
        if (saving) return;
        saving = true;
        watch([haptics, touchTurnSensitivity], save);
      });
    return loaded;
  }

  function save() {
    const text = JSON.stringify({ haptics: haptics.value, touchTurnSensitivity: touchTurnSensitivity.value });
    storage()
      .setItem(SETTINGS_KEY, text)
      .catch((error: unknown) => console.error("[haex-doom] Could not save settings:", error));
  }

  /**
   * The stored engine config files, or the given defaults for those not stored yet. A stored
   * file wins over the defaults, so settings whose default changed since it was stored are
   * brought up to date first, once per version.
   */
  async function engineConfigs(defaults: Record<string, string>): Promise<Record<string, string>> {
    const storedVersion = Number(await storage().getItem(ENGINE_CONFIG_VERSION_KEY).catch(() => null)) || 0;
    let migrationSucceeded = true;
    const entries = await Promise.all(
      Object.entries(defaults).map(async ([name, text]) => {
        const stored = await storage().getItem(ENGINE_CONFIG_KEY(name)).catch(() => null);
        if (stored === null) return [name, text] as const;
        const migrated = migrateEngineConfig(name, stored, storedVersion);
        if (migrated !== stored) {
          try {
            await storeEngineConfig(name, migrated);
          } catch (cause: unknown) {
            migrationSucceeded = false;
            console.error("[haex-doom] Could not store the migrated", name, cause);
          }
        }
        return [name, migrated] as const;
      }),
    );
    if (storedVersion < ENGINE_CONFIG_VERSION && migrationSucceeded) {
      await storage().setItem(ENGINE_CONFIG_VERSION_KEY, String(ENGINE_CONFIG_VERSION)).catch((cause: unknown) => console.error("[haex-doom] Could not store the config version:", cause));
    }
    return Object.fromEntries(entries);
  }

  function storeEngineConfig(fileName: string, text: string): Promise<void> {
    return storage().setItem(ENGINE_CONFIG_KEY(fileName), text);
  }

  /** Short vibration on fire (kind 0) and damage (kind 1), FR-014. */
  function vibrate(kind: number) {
    if (!haptics.value || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(kind === 0 ? 15 : 40);
  }

  return { haptics, touchTurnSensitivity, load, engineConfigs, storeEngineConfig, vibrate };
});
