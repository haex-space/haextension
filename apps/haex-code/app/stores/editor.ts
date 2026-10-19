import type { EditorTab } from "~/types";
import { basename } from "~/lib/path";

export const useEditorStore = defineStore("editor", () => {
  const haexVault = useHaexVaultStore();
  const { detectLanguage } = useLanguageDetection();
  const tabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value) ?? null
  );

  const openTab = (tab: Omit<EditorTab, "savedContent" | "isDirty">) => {
    // Untitled tabs have no path yet and are never the same file.
    const existing = tab.path ? tabs.value.find((t) => t.path === tab.path) : undefined;
    if (existing) {
      activeTabId.value = existing.id;
      return;
    }
    tabs.value.push({ ...tab, savedContent: tab.content, isDirty: false });
    activeTabId.value = tab.id;
  };

  const closeTab = (tabId: string) => {
    const idx = tabs.value.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    tabs.value.splice(idx, 1);

    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value[Math.min(idx, tabs.value.length - 1)]?.id ?? null;
    }
  };

  const updateTabContent = (tabId: string, content: string) => {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab) {
      tab.content = content;
      tab.isDirty = content !== tab.savedContent;
    }
  };

  /**
   * Writes the tab to its file; an untitled tab asks for a file first.
   * Returns false when that dialog is cancelled. Throws when writing fails, so callers can keep the tab open.
   */
  const saveTabAsync = async (tabId: string): Promise<boolean> => {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return false;
    const content = tab.content;
    const data = new TextEncoder().encode(content);
    if (tab.path) {
      await haexVault.client.filesystem.writeFile(tab.path, data);
    } else {
      const result = await haexVault.client.filesystem.saveFileAsync(data, { defaultPath: tab.name });
      if (!result) return false;
      if (!result.success) throw new Error(`Saving "${tab.name}" failed`);
      tab.path = result.path;
      tab.name = basename(result.path);
      tab.language = detectLanguage(result.path);
    }
    tab.savedContent = content;
    // Edits made while the write was in flight are not on disk yet.
    tab.isDirty = tab.content !== content;
    return true;
  };

  const moveTab = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const moved = tabs.value.splice(fromIndex, 1)[0];
    if (moved) tabs.value.splice(toIndex, 0, moved);
  };

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    closeTab,
    updateTabContent,
    saveTabAsync,
    moveTab,
  };
});
