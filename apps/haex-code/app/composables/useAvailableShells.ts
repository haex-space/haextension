interface ShellInfo {
  name: string;
  path: string;
}

export function useAvailableShells() {
  const haexVault = useHaexVaultStore();
  const shells = ref<ShellInfo[]>([]);
  const isLoaded = ref(false);

  const detectShells = async () => {
    if (isLoaded.value) return;

    try {
      // Uses the backend's shell.listAvailable() — no permission prompt needed
      const available = await haexVault.client.shell.listAvailable();
      shells.value = available.length > 0 ? available : [{ name: "sh", path: "/bin/sh" }];
    } catch (e) {
      console.error("[haex-code] Failed to detect shells:", e);
      shells.value = [{ name: "sh", path: "/bin/sh" }];
    }

    isLoaded.value = true;
  };

  return {
    shells,
    detectShells,
  };
}
