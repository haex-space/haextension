<script setup lang="ts">
import type { TerminalTab } from "~/types";
import type { EventCallback } from "@haex-space/vault-sdk";

const props = defineProps<{
  tab: TerminalTab;
}>();

const haexVault = useHaexVaultStore();
const terminalStore = useTerminalStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();

const terminalContainer = ref<HTMLElement | null>(null);
const terminalInstance = shallowRef<any>(null);
const fitAddon = shallowRef<any>(null);

const scrollbarTrack = ref<HTMLElement | null>(null);

const scrollbar = reactive({
  visible: false,
  hovered: false,
  dragging: false,
  top: 0,
  height: 100,
});

const updateScrollbar = (term: any) => {
  if (scrollbar.dragging) return;
  const buffer = term.buffer.active;
  const totalLines = buffer.length;
  const visibleRows = term.rows;
  if (totalLines <= visibleRows) {
    scrollbar.visible = false;
    return;
  }
  scrollbar.visible = true;
  const scrollableLines = totalLines - visibleRows;
  const scrollTop = buffer.viewportY;
  scrollbar.height = Math.max((visibleRows / totalLines) * 100, 5);
  scrollbar.top = (scrollTop / scrollableLines) * (100 - scrollbar.height);
};

const onThumbMousedown = (e: MouseEvent) => {
  e.preventDefault();
  scrollbar.dragging = true;
  const startY = e.clientY;
  const startTop = scrollbar.top;
  const trackHeight = scrollbarTrack.value?.clientHeight || 1;

  const onMousemove = (ev: MouseEvent) => {
    const deltaY = ev.clientY - startY;
    const deltaPct = (deltaY / trackHeight) * 100;
    const newTop = Math.max(0, Math.min(100 - scrollbar.height, startTop + deltaPct));
    scrollbar.top = newTop;

    // Scroll xterm to matching position
    const term = terminalInstance.value;
    if (!term) return;
    const buffer = term.buffer.active;
    const scrollableLines = buffer.length - term.rows;
    const targetLine = Math.round((newTop / (100 - scrollbar.height)) * scrollableLines);
    term.scrollToLine(targetLine);
  };

  const onMouseup = () => {
    scrollbar.dragging = false;
    document.removeEventListener("mousemove", onMousemove);
    document.removeEventListener("mouseup", onMouseup);
  };

  document.addEventListener("mousemove", onMousemove);
  document.addEventListener("mouseup", onMouseup);
};

const onTrackClick = (e: MouseEvent) => {
  const term = terminalInstance.value;
  if (!term || !scrollbarTrack.value) return;
  const rect = scrollbarTrack.value.getBoundingClientRect();
  const clickPct = ((e.clientY - rect.top) / rect.height) * 100;
  const buffer = term.buffer.active;
  const scrollableLines = buffer.length - term.rows;
  const targetLine = Math.round((clickPct / 100) * scrollableLines);
  term.scrollToLine(targetLine);
};

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
    fontSize: settings.terminalFontSize,
    fontFamily: settings.terminalFontFamily,
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
    const { sessionId, shellName } = await haexVault.client.shell.create({
      shell: props.tab.shell || undefined,
      cwd: workspace.rootPath || undefined,
      cols: term.cols,
      rows: term.rows,
    });

    console.log("[haex-code] Shell session created:", { sessionId, shellName });
    terminalStore.setSessionId(props.tab.id, sessionId);
    if (shellName) {
      terminalStore.renameTab(props.tab.id, shellName);
    }

    // Listen for PTY output → write to xterm
    const onOutput = ((event: any) => {
      console.log("[haex-code] Shell output event received:", event);
      if (event.sessionId === sessionId) {
        term.write(event.data);
      }
    }) as unknown as EventCallback;

    const onExit = ((event: any) => {
      console.log("[haex-code] Shell exit event received:", event);
      if (event.sessionId === sessionId) {
        term.writeln(`\r\n\x1b[90m[Process exited${event.exitCode != null ? ` with code ${event.exitCode}` : ''}]\x1b[0m`);
        terminalStore.setSessionId(props.tab.id, null);
      }
    }) as unknown as EventCallback;

    haexVault.client.shell.onData(onOutput);
    haexVault.client.shell.onExit(onExit);
    console.log("[haex-code] Shell event listeners registered for session:", sessionId);

    // Ctrl+Shift+C → copy selection (like a real Linux terminal)
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
        return false;
      }
      return true;
    });

    // Forward xterm input → PTY stdin
    term.onData((data: string) => {
      console.log("[haex-code] xterm input:", JSON.stringify(data), "sessionId:", props.tab.sessionId);
      if (props.tab.sessionId) {
        haexVault.client.shell.write(props.tab.sessionId, data);
      } else {
        console.warn("[haex-code] No sessionId, input dropped!");
      }
    });

    // Sync custom scrollbar with xterm scroll state
    term.onScroll(() => updateScrollbar(term));
    term.onLineFeed(() => updateScrollbar(term));
    term.onRender(() => updateScrollbar(term));

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

watch(
  () => ({ fontSize: settings.terminalFontSize, fontFamily: settings.terminalFontFamily }),
  (opts) => {
    const term = terminalInstance.value;
    if (!term) return;
    term.options.fontSize = opts.fontSize;
    term.options.fontFamily = opts.fontFamily;
    fitAddon.value?.fit();
  },
  { deep: true }
);

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
  <div class="relative h-full w-full">
    <div ref="terminalContainer" class="terminal-host absolute inset-0" />
    <!-- Custom scrollbar track + thumb matching shadcn ScrollArea -->
    <div
      v-show="scrollbar.visible"
      ref="scrollbarTrack"
      class="absolute right-0 top-0 z-20 flex h-full w-2.5 border-l border-l-transparent p-px"
      @mouseenter="scrollbar.hovered = true"
      @mouseleave="scrollbar.dragging || (scrollbar.hovered = false)"
      @click.self="onTrackClick"
    >
      <div
        class="relative w-full cursor-pointer rounded-full bg-border transition-opacity"
        :class="scrollbar.hovered || scrollbar.dragging ? 'opacity-100' : 'opacity-0'"
        :style="{ top: `${scrollbar.top}%`, height: `${scrollbar.height}%` }"
        @mousedown="onThumbMousedown"
      />
    </div>
  </div>
</template>

<style>
/* Hide xterm.js native scrollbar */
.terminal-host .xterm-viewport {
  scrollbar-width: none !important;
}

.terminal-host .xterm-viewport::-webkit-scrollbar {
  display: none !important;
}
</style>
