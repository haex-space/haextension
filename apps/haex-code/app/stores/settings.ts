import { watchDebounced } from "@vueuse/core";
import { eq } from "drizzle-orm";
import { settings as settingsTable } from "~/database/schemas";

export type UiScale = "compact" | "default" | "comfortable" | "spacious";

interface ScaleConfig {
  fontSize: string;
  iconSize: string;
  rowPadding: string;
  indent: number;
  lineHeight: string;
}

const SCALE_MAP: Record<UiScale, ScaleConfig> = {
  compact: {
    fontSize: "text-xs",
    iconSize: "size-3.5",
    rowPadding: "py-0.5",
    indent: 14,
    lineHeight: "leading-tight",
  },
  default: {
    fontSize: "text-sm",
    iconSize: "size-4",
    rowPadding: "py-1",
    indent: 18,
    lineHeight: "leading-normal",
  },
  comfortable: {
    fontSize: "text-sm",
    iconSize: "size-4.5",
    rowPadding: "py-1.5",
    indent: 20,
    lineHeight: "leading-normal",
  },
  spacious: {
    fontSize: "text-base",
    iconSize: "size-5",
    rowPadding: "py-2",
    indent: 22,
    lineHeight: "leading-relaxed",
  },
};

export const EDITOR_THEMES = [
  { value: "vs-dark", label: "Dark (VS Code)" },
  { value: "vs", label: "Light (VS Code)" },
  { value: "hc-black", label: "High Contrast Dark" },
  { value: "hc-light", label: "High Contrast Light" },
] as const;

export const FONT_FAMILIES = [
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'Fira Code', monospace", label: "Fira Code" },
  { value: "'Cascadia Code', monospace", label: "Cascadia Code" },
  { value: "'Source Code Pro', monospace", label: "Source Code Pro" },
  { value: "'Ubuntu Mono', monospace", label: "Ubuntu Mono" },
  { value: "monospace", label: "System Monospace" },
] as const;

export const useSettingsStore = defineStore("settings", () => {
  const haexVault = useHaexVaultStore();

  // UI
  const uiScale = ref<UiScale>("default");

  // Editor
  const editorFontSize = ref(14);
  const editorFontFamily = ref("'JetBrains Mono', monospace");
  const editorTheme = ref("vs-dark");
  const editorTabSize = ref(2);
  const editorWordWrap = ref<"off" | "on" | "wordWrapColumn">("off");
  const editorMinimap = ref(true);
  const editorLineNumbers = ref<"on" | "off" | "relative">("on");

  // Terminal
  const terminalFontSize = ref(14);
  const terminalFontFamily = ref("'JetBrains Mono', monospace");

  const scale = computed(() => SCALE_MAP[uiScale.value]);
  const isLoaded = ref(false);

  // Sync editor theme → UI color mode
  const isDarkTheme = computed(() =>
    editorTheme.value === "vs-dark" || editorTheme.value === "hc-black"
  );

  watch(editorTheme, () => {
    const ui = useUiStore();
    ui.currentThemeName = isDarkTheme.value ? "dark" : "light";
  });

  const allSettings = computed(() => ({
    uiScale: uiScale.value,
    editorTheme: editorTheme.value,
    editorFontSize: editorFontSize.value,
    editorFontFamily: editorFontFamily.value,
    editorTabSize: editorTabSize.value,
    editorWordWrap: editorWordWrap.value,
    editorMinimap: editorMinimap.value,
    editorLineNumbers: editorLineNumbers.value,
    terminalFontSize: terminalFontSize.value,
    terminalFontFamily: terminalFontFamily.value,
  }));

  // Load settings from DB
  const loadFromDb = async () => {
    const orm = haexVault.orm;
    if (!orm) {
      console.warn("[haex-code] Settings: ORM not available, skipping load");
      isLoaded.value = true;
      return;
    }

    try {
      const rows = await orm.select().from(settingsTable);
      console.log("[haex-code] Settings loaded from DB:", rows.length, "rows");
      const row = rows[0];
      if (row) {
        uiScale.value = (row.uiScale as UiScale) || "default";
        editorTheme.value = row.editorTheme || "vs-dark";
        editorFontSize.value = row.editorFontSize ?? 14;
        editorFontFamily.value = row.editorFontFamily || "'JetBrains Mono', monospace";
        editorTabSize.value = row.editorTabSize ?? 2;
        editorWordWrap.value = (row.editorWordWrap as "off" | "on" | "wordWrapColumn") || "off";
        editorMinimap.value = row.editorMinimap ?? true;
        editorLineNumbers.value = (row.editorLineNumbers as "on" | "off" | "relative") || "on";
        terminalFontSize.value = row.terminalFontSize ?? 14;
        terminalFontFamily.value = row.terminalFontFamily || "'JetBrains Mono', monospace";
      } else {
        // First run: insert default row so subsequent saves use UPDATE
        await orm.insert(settingsTable).values({ id: "default", ...allSettings.value });
        console.log("[haex-code] Settings: created default row in DB");
      }
      isLoaded.value = true;
    } catch (e) {
      console.error("[haex-code] Settings: Failed to load from DB:", e);
      isLoaded.value = true;
    }
  };

  // Auto-persist: debounced UPDATE on any setting change
  watchDebounced(
    allSettings,
    async (data: typeof allSettings.value) => {
      if (!isLoaded.value) return;
      const orm = haexVault.orm;
      if (!orm) return;
      try {
        await orm.update(settingsTable).set(data).where(eq(settingsTable.id, "default"));
        console.log("[haex-code] Settings saved to DB");
      } catch (e) {
        console.error("[haex-code] Settings: Failed to save to DB:", e);
      }
    },
    { debounce: 300, deep: true },
  );

  return {
    uiScale,
    editorFontSize,
    editorFontFamily,
    editorTheme,
    editorTabSize,
    editorWordWrap,
    editorMinimap,
    editorLineNumbers,
    terminalFontSize,
    terminalFontFamily,
    scale,
    isLoaded,
    loadFromDb,
  };
});
