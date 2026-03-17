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

export const useSettingsStore = defineStore("settings", () => {
  const uiScale = ref<UiScale>("default");
  const editorFontSize = ref(14);
  const terminalFontSize = ref(14);
  const editorTheme = ref("vs-dark");

  const scale = computed(() => SCALE_MAP[uiScale.value]);

  return {
    uiScale,
    editorFontSize,
    terminalFontSize,
    editorTheme,
    scale,
  };
});
