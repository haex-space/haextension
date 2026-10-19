export type UiScale = "compact" | "default" | "comfortable" | "spacious";

export const UI_SCALES: UiScale[] = ["compact", "default", "comfortable", "spacious"];

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
