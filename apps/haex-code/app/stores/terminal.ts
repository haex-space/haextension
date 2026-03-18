import type { TerminalTab } from "~/types";

export const useTerminalStore = defineStore("terminal", () => {
  const tabs = ref<TerminalTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value) ?? null
  );

  const addTab = (name?: string, shell?: string): TerminalTab => {
    const id = crypto.randomUUID();
    const tab: TerminalTab = {
      id,
      name: name || `Terminal ${tabs.value.length + 1}`,
      sessionId: null,
      shell,
    };
    tabs.value.push(tab);
    activeTabId.value = id;
    return tab;
  };

  const closeTab = (tabId: string) => {
    const idx = tabs.value.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    tabs.value.splice(idx, 1);

    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value[Math.min(idx, tabs.value.length - 1)]?.id ?? null;
    }
  };

  const setSessionId = (tabId: string, sessionId: string | null) => {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab) tab.sessionId = sessionId;
  };

  const renameTab = (tabId: string, name: string) => {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab) tab.name = name;
  };

  return {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    closeTab,
    setSessionId,
    renameTab,
  };
});
