<script setup lang="ts">
import type { TerminalTab } from "~/types";
import type { ShellOutputEvent, ShellExitEvent } from "@haex-space/vault-sdk";

const props = defineProps<{
  tab: TerminalTab;
}>();

const haexVault = useHaexVaultStore();
const terminalStore = useTerminalStore();
const workspace = useWorkspaceStore();

const terminalContainer = ref<HTMLElement | null>(null);
const terminalInstance = shallowRef<any>(null);
const fitAddon = shallowRef<any>(null);

const initTerminal = async () => {
  if (!terminalContainer.value) return;

  const { Terminal } = await import("@xterm/xterm");
  const { FitAddon } = await import("@xterm/addon-fit");
  const { WebLinksAddon } = await import("@xterm/addon-web-links");
  await import("@xterm/xterm/css/xterm.css");

  const fit = new FitAddon();
  fitAddon.value = fit;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    theme: {
      background: "#000000",
      foreground: "#cccccc",
      cursor: "#ffffff",
      selectionBackground: "#264f78",
    },
    allowProposedApi: true,
  });

  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());

  term.open(terminalContainer.value);
  fit.fit();

  terminalInstance.value = term;

  // Connect to vault-sdk shell API
  try {
    const sessionId = await haexVault.client.shell.create({
      cwd: workspace.rootPath || undefined,
      cols: term.cols,
      rows: term.rows,
    });

    terminalStore.setSessionId(props.tab.id, sessionId);

    // Listen for PTY output → write to xterm
    const onOutput = (event: ShellOutputEvent) => {
      if (event.sessionId === sessionId) {
        term.write(event.data);
      }
    };

    const onExit = (event: ShellExitEvent) => {
      if (event.sessionId === sessionId) {
        term.writeln(`\r\n\x1b[90m[Process exited${event.exitCode != null ? ` with code ${event.exitCode}` : ''}]\x1b[0m`);
        terminalStore.setSessionId(props.tab.id, null);
      }
    };

    haexVault.client.shell.onData(onOutput);
    haexVault.client.shell.onExit(onExit);

    // Forward xterm input → PTY stdin
    term.onData((data: string) => {
      if (props.tab.sessionId) {
        haexVault.client.shell.write(props.tab.sessionId, data);
      }
    });

    // Forward resize events → PTY resize
    term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (props.tab.sessionId) {
        haexVault.client.shell.resize(props.tab.sessionId, cols, rows);
      }
    });
  } catch (e) {
    console.error("[haex-code] Failed to create shell session:", e);
    term.writeln("\x1b[1;31mFailed to start shell\x1b[0m");
    term.writeln(`\x1b[90m${e}\x1b[0m`);
  }

  // Handle container resize → fit terminal
  const resizeObserver = new ResizeObserver(() => {
    fit.fit();
  });
  resizeObserver.observe(terminalContainer.value);
};

onMounted(initTerminal);

onUnmounted(async () => {
  // Close shell session when component is destroyed
  if (props.tab.sessionId) {
    try {
      await haexVault.client.shell.close(props.tab.sessionId);
    } catch {
      // Session may already be closed
    }
  }
  terminalInstance.value?.dispose();
});
</script>

<template>
  <div ref="terminalContainer" class="h-full w-full" />
</template>
