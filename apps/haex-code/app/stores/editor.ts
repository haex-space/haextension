import type { EditorTab } from "~/types";

export const useEditorStore = defineStore("editor", () => {
  const haexVault = useHaexVaultStore();
  const tabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value) ?? null
  );

  const openTab = (tab: Omit<EditorTab, "savedContent" | "isDirty">) => {
    const existing = tabs.value.find((t) => t.path === tab.path);
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

  /** Writes the tab to its file. Throws when the write fails, so callers can keep the tab open. */
  const saveTabAsync = async (tabId: string): Promise<void> => {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.path) throw new Error(`"${tab.name}" has no file path yet`);
    const content = tab.content;
    await haexVault.client.filesystem.writeFile(tab.path, new TextEncoder().encode(content));
    tab.savedContent = content;
    // Edits made while the write was in flight are not on disk yet.
    tab.isDirty = tab.content !== content;
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
