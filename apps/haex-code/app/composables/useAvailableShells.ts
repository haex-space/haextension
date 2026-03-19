interface ShellInfo {
  name: string;
  path: string;
}

const DESKTOP_SHELLS: ShellInfo[] = [
  { name: "bash", path: "/bin/bash" },
  { name: "zsh", path: "/bin/zsh" },
  { name: "fish", path: "/usr/bin/fish" },
  { name: "sh", path: "/bin/sh" },
];

const ANDROID_SHELLS: ShellInfo[] = [
  { name: "bash", path: "/data/data/com.termux/files/usr/bin/bash" },
  { name: "zsh", path: "/data/data/com.termux/files/usr/bin/zsh" },
  { name: "fish", path: "/data/data/com.termux/files/usr/bin/fish" },
  { name: "sh", path: "/system/bin/sh" },
];

export function useAvailableShells() {
  const haexVault = useHaexVaultStore();
  const shells = ref<ShellInfo[]>([]);
  const isLoaded = ref(false);
  const hasTermux = ref(false);

  const detectShells = async () => {
    if (isLoaded.value) return;

    const platform = haexVault.state.context?.platform;
    const isAndroid = platform === "android";
    const knownShells = isAndroid ? ANDROID_SHELLS : DESKTOP_SHELLS;

    const available: ShellInfo[] = [];
    for (const shell of knownShells) {
      try {
        const exists = await haexVault.client.filesystem.exists(shell.path);
        if (exists) {
          available.push(shell);
          if (isAndroid && shell.path.includes("com.termux")) {
            hasTermux.value = true;
          }
        }
      } catch {
        // Permission denied or not found - skip
      }
    }

    const fallback = isAndroid
      ? { name: "sh", path: "/system/bin/sh" }
      : { name: "sh", path: "/bin/sh" };

    shells.value = available.length > 0 ? available : [fallback];
    isLoaded.value = true;
  };

  return {
    shells,
    hasTermux,
    detectShells,
  };
}
