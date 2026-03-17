import type { EditorTab } from "~/types";

export const useEditorStore = defineStore("editor", () => {
  const tabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value) ?? null
  );

  const openTab = (tab: EditorTab) => {
    const existing = tabs.value.find((t) => t.path === tab.path);
    if (existing) {
      activeTabId.value = existing.id;
      return;
    }
    tabs.value.push(tab);
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
      tab.isDirty = true;
    }
  };

  const markTabClean = (tabId: string) => {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab) tab.isDirty = false;
  };

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    closeTab,
    updateTabContent,
    markTabClean,
  };
});
