interface ShellInfo {
  name: string;
  path: string;
}

const KNOWN_SHELLS: ShellInfo[] = [
  { name: "bash", path: "/bin/bash" },
  { name: "zsh", path: "/bin/zsh" },
  { name: "fish", path: "/usr/bin/fish" },
  { name: "sh", path: "/bin/sh" },
];

export function useAvailableShells() {
  const haexVault = useHaexVaultStore();
  const shells = ref<ShellInfo[]>([]);
  const isLoaded = ref(false);

  const detectShells = async () => {
    if (isLoaded.value) return;

    const available: ShellInfo[] = [];
    for (const shell of KNOWN_SHELLS) {
      try {
        const exists = await haexVault.client.filesystem.exists(shell.path);
        if (exists) {
          available.push(shell);
        }
      } catch {
        // Permission denied or not found - skip
      }
    }

    shells.value = available.length > 0 ? available : [{ name: "sh", path: "/bin/sh" }];
    isLoaded.value = true;
  };

  return {
    shells,
    detectShells,
  };
}
