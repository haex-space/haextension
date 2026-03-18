<script setup lang="ts">
import {
  ArrowLeft,
  Minus,
  Plus,
  Monitor,
  Code,
  Terminal as TerminalIcon,
} from "lucide-vue-next";
import { EDITOR_THEMES, FONT_FAMILIES, type UiScale } from "~/stores/settings";

const { t } = useI18n();
const settings = useSettingsStore();

const emit = defineEmits<{
  close: [];
}>();

const UI_SCALES: UiScale[] = ["compact", "default", "comfortable", "spacious"];

const WORD_WRAP_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
  { value: "wordWrapColumn", label: "Column" },
] as const;

const LINE_NUMBER_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
  { value: "relative", label: "Relative" },
] as const;

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") emit("close");
};

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <div class="absolute inset-0 z-50 flex flex-col bg-background">
    <!-- Header -->
    <div class="flex items-center gap-3 border-b border-border px-6 py-4">
      <button
        class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        @click="emit('close')"
      >
        <ArrowLeft class="size-5" />
      </button>
      <h1 class="text-lg font-semibold">{{ t("settings") }}</h1>
      <span class="ml-auto text-xs text-muted-foreground">Esc</span>
    </div>

    <!-- Content -->
    <ShadcnScrollArea class="flex-1">
      <div class="mx-auto max-w-2xl space-y-10 px-6 py-8">

        <!-- UI Section -->
        <section class="space-y-5">
          <div class="flex items-center gap-2 border-b border-border pb-2">
            <Monitor class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold uppercase tracking-wider">{{ t("ui") }}</h2>
          </div>

          <div class="grid gap-4">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium">{{ t("uiScale") }}</label>
                <p class="text-xs text-muted-foreground">{{ t("uiScaleDesc") }}</p>
              </div>
              <ShadcnSelect v-model="settings.uiScale">
                <ShadcnSelectTrigger class="w-44">
                  <ShadcnSelectValue />
                </ShadcnSelectTrigger>
                <ShadcnSelectContent>
                  <ShadcnSelectItem v-for="s in UI_SCALES" :key="s" :value="s">
                    {{ s }}
                  </ShadcnSelectItem>
                </ShadcnSelectContent>
              </ShadcnSelect>
            </div>
          </div>
        </section>

        <!-- Editor Section -->
        <section class="space-y-5">
          <div class="flex items-center gap-2 border-b border-border pb-2">
            <Code class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold uppercase tracking-wider">{{ t("editor") }}</h2>
          </div>

          <div class="grid gap-5">
            <!-- Theme -->
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium">{{ t("theme") }}</label>
                <p class="text-xs text-muted-foreground">{{ t("themeDesc") }}</p>
              </div>
              <ShadcnSelect v-model="settings.editorTheme">
                <ShadcnSelectTrigger class="w-44">
                  <ShadcnSelectValue />
                </ShadcnSelectTrigger>
                <ShadcnSelectContent>
                  <ShadcnSelectItem v-for="th in EDITOR_THEMES" :key="th.value" :value="th.value">
                    {{ th.label }}
                  </ShadcnSelectItem>
                </ShadcnSelectContent>
              </ShadcnSelect>
            </div>

            <!-- Font Family -->
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium">{{ t("fontFamily") }}</label>
                <p class="text-xs text-muted-foreground">{{ t("fontFamilyDesc") }}</p>
              </div>
              <ShadcnSelect v-model="settings.editorFontFamily">
                <ShadcnSelectTrigger class="w-44">
                  <ShadcnSelectValue />
                </ShadcnSelectTrigger>
                <ShadcnSelectContent>
                  <ShadcnSelectItem v-for="f in FONT_FAMILIES" :key="f.value" :value="f.value">
                    {{ f.label }}
                  </ShadcnSelectItem>
                </ShadcnSelectContent>
              </ShadcnSelect>
            </div>

            <!-- Font Size -->
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">{{ t("fontSize") }}</label>
              <div class="flex items-center gap-3">
                <ShadcnButton variant="outline" size="icon" class="size-8" @click="settings.editorFontSize = Math.max(8, settings.editorFontSize - 1)">
                  <Minus class="size-3" />
                </ShadcnButton>
                <span class="w-12 text-center text-sm tabular-nums">{{ settings.editorFontSize }}px</span>
                <ShadcnButton variant="outline" size="icon" class="size-8" @click="settings.editorFontSize = Math.min(32, settings.editorFontSize + 1)">
                  <Plus class="size-3" />
                </ShadcnButton>
              </div>
            </div>

            <!-- Tab Size -->
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">{{ t("tabSize") }}</label>
              <div class="flex items-center gap-3">
                <ShadcnButton variant="outline" size="icon" class="size-8" @click="settings.editorTabSize = Math.max(1, settings.editorTabSize - 1)">
                  <Minus class="size-3" />
                </ShadcnButton>
                <span class="w-12 text-center text-sm tabular-nums">{{ settings.editorTabSize }}</span>
                <ShadcnButton variant="outline" size="icon" class="size-8" @click="settings.editorTabSize = Math.min(8, settings.editorTabSize + 1)">
                  <Plus class="size-3" />
                </ShadcnButton>
              </div>
            </div>

            <!-- Word Wrap -->
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">{{ t("wordWrap") }}</label>
              <ShadcnSelect v-model="settings.editorWordWrap">
                <ShadcnSelectTrigger class="w-44">
                  <ShadcnSelectValue />
                </ShadcnSelectTrigger>
                <ShadcnSelectContent>
                  <ShadcnSelectItem v-for="w in WORD_WRAP_OPTIONS" :key="w.value" :value="w.value">
                    {{ w.label }}
                  </ShadcnSelectItem>
                </ShadcnSelectContent>
              </ShadcnSelect>
            </div>

            <!-- Minimap -->
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium">{{ t("minimap") }}</label>
                <p class="text-xs text-muted-foreground">{{ t("minimapDesc") }}</p>
              </div>
              <ShadcnSwitch v-model:checked="settings.editorMinimap" />
            </div>

            <!-- Line Numbers -->
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">{{ t("lineNumbers") }}</label>
              <ShadcnSelect v-model="settings.editorLineNumbers">
                <ShadcnSelectTrigger class="w-44">
                  <ShadcnSelectValue />
                </ShadcnSelectTrigger>
                <ShadcnSelectContent>
                  <ShadcnSelectItem v-for="l in LINE_NUMBER_OPTIONS" :key="l.value" :value="l.value">
                    {{ l.label }}
                  </ShadcnSelectItem>
                </ShadcnSelectContent>
              </ShadcnSelect>
            </div>
          </div>
        </section>

        <!-- Terminal Section -->
        <section class="space-y-5">
          <div class="flex items-center gap-2 border-b border-border pb-2">
            <TerminalIcon class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold uppercase tracking-wider">{{ t("terminal") }}</h2>
          </div>

          <div class="grid gap-5">
            <!-- Terminal Font Family -->
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">{{ t("fontFamily") }}</label>
              <ShadcnSelect v-model="settings.terminalFontFamily">
                <ShadcnSelectTrigger class="w-44">
                  <ShadcnSelectValue />
                </ShadcnSelectTrigger>
                <ShadcnSelectContent>
                  <ShadcnSelectItem v-for="f in FONT_FAMILIES" :key="f.value" :value="f.value">
                    {{ f.label }}
                  </ShadcnSelectItem>
                </ShadcnSelectContent>
              </ShadcnSelect>
            </div>

            <!-- Terminal Font Size -->
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">{{ t("fontSize") }}</label>
              <div class="flex items-center gap-3">
                <ShadcnButton variant="outline" size="icon" class="size-8" @click="settings.terminalFontSize = Math.max(8, settings.terminalFontSize - 1)">
                  <Minus class="size-3" />
                </ShadcnButton>
                <span class="w-12 text-center text-sm tabular-nums">{{ settings.terminalFontSize }}px</span>
                <ShadcnButton variant="outline" size="icon" class="size-8" @click="settings.terminalFontSize = Math.min(32, settings.terminalFontSize + 1)">
                  <Plus class="size-3" />
                </ShadcnButton>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ShadcnScrollArea>
  </div>
</template>

<i18n lang="yaml">
de:
  settings: Einstellungen
  ui: Benutzeroberfläche
  uiScale: UI-Skalierung
  uiScaleDesc: Größe von Icons und Text in der Seitenleiste
  editor: Editor
  theme: Theme
  themeDesc: Farbschema des Editors und der IDE
  fontFamily: Schriftart
  fontFamilyDesc: Monospace-Schrift für den Editor
  fontSize: Schriftgröße
  tabSize: Tab-Größe
  wordWrap: Zeilenumbruch
  minimap: Minimap
  minimapDesc: Code-Vorschau am rechten Rand
  lineNumbers: Zeilennummern
  terminal: Terminal
en:
  settings: Settings
  ui: User Interface
  uiScale: UI Scale
  uiScaleDesc: Size of icons and text in the sidebar
  editor: Editor
  theme: Theme
  themeDesc: Color scheme for editor and IDE
  fontFamily: Font Family
  fontFamilyDesc: Monospace font for the editor
  fontSize: Font Size
  tabSize: Tab Size
  wordWrap: Word Wrap
  minimap: Minimap
  minimapDesc: Code preview on the right edge
  lineNumbers: Line Numbers
  terminal: Terminal
</i18n>
