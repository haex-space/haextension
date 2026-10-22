import { createHaexImports, type HaexImports } from "~/lib/engine/imports";

/** The part of the Emscripten module the shell uses (contracts/engine-bridge.md). */
interface EngineModule {
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, data: Uint8Array | string) => void;
    readFile: (path: string) => Uint8Array;
  };
  callMain: (args: string[]) => void;
  cwrap: (name: string, returnType: null, argTypes: string[]) => (...args: number[]) => void;
  SDL2?: { audioContext?: AudioContext };
}

type EngineFactory = (options: Record<string, unknown>) => Promise<EngineModule>;

export type EngineState = "idle" | "loading" | "running" | "failed";
export type EngineError = "host-outdated" | "load-failed" | "crashed";

export interface EngineStartOptions {
  canvas: HTMLCanvasElement;
  wad: Uint8Array;
  fileName: string;
  fingerprint: string;
  /** File name in /config → contents. */
  configs: Record<string, string>;
  /** Slot → save file contents. */
  saves?: Map<number, Uint8Array>;
  /** Arguments after the fixed ones (game file, config, save directory). */
  args?: string[];
  imports?: Partial<HaexImports>;
  /** Created in the user's start gesture (lib/audioUnlock.ts); SDL plays through it. */
  audioContext: AudioContext;
}

const EV_KEYDOWN = 0;
const EV_KEYUP = 1;

let instance: EngineModule | null = null;
let postEventFn: ((...args: number[]) => void) | null = null;
let setPausedFn: ((...args: number[]) => void) | null = null;

const state = ref<EngineState>("idle");
const error = ref<EngineError | null>(null);

function isHostOutdated(cause: unknown): boolean {
  // Without 'wasm-unsafe-eval' in the frame's CSP, compiling WebAssembly is refused.
  return cause instanceof WebAssembly.CompileError || (cause instanceof Error && /unsafe-eval|Content Security Policy|CSP/i.test(cause.message));
}

/** Whether this frame may compile WebAssembly; the smallest valid module is 8 bytes. */
export function canCompileWebAssembly(): boolean {
  try {
    new WebAssembly.Module(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    return true;
  } catch {
    return false;
  }
}

async function loadFactory(): Promise<EngineFactory> {
  const url = new URL("engine/crispy-doom.js", document.baseURI).href;
  const engineModule = (await import(/* @vite-ignore */ url)) as { default: EngineFactory };
  return engineModule.default;
}

function prepareFileSystem(module: EngineModule, options: EngineStartOptions): string {
  const saveDir = `/saves/${options.fingerprint}/`;
  module.FS.mkdirTree("/wads");
  module.FS.mkdirTree("/config");
  module.FS.mkdirTree(saveDir);
  module.FS.writeFile(`/wads/${options.fileName}`, options.wad);
  for (const [name, contents] of Object.entries(options.configs)) {
    module.FS.writeFile(`/config/${name}`, contents);
  }
  for (const [slot, data] of options.saves ?? []) {
    module.FS.writeFile(`${saveDir}doomsav${slot}.dsg`, data);
  }
  return saveDir;
}

/** Loads and runs the engine; one game at a time per page. */
export function useEngine() {
  async function start(options: EngineStartOptions): Promise<void> {
    if (state.value === "loading" || state.value === "running") return;
    state.value = "loading";
    error.value = null;

    const imports = { ...createHaexImports(), ...options.imports };
    try {
      const factory = await loadFactory();
      const module = await factory({
        canvas: options.canvas,
        haexImports: imports,
        SDL2: { audioContext: options.audioContext },
        onExit: () => stopped(null),
        onAbort: () => stopped("crashed"),
      });
      instance = module;
      postEventFn = module.cwrap("haex_post_event", null, ["number", "number", "number", "number", "number"]);
      setPausedFn = module.cwrap("haex_set_paused", null, ["number"]);

      const saveDir = prepareFileSystem(module, options);
      state.value = "running";
      module.callMain([
        "-iwad", `/wads/${options.fileName}`,
        "-config", "/config/default.cfg",
        "-extraconfig", "/config/crispy-doom.cfg",
        "-savedir", saveDir,
        ...(options.args ?? []),
      ]);
    } catch (cause) {
      console.error("[haex-doom] Engine failed to start:", cause);
      stopped(isHostOutdated(cause) ? "host-outdated" : "load-failed");
    }
  }

  function stopped(reason: EngineError | null) {
    instance = null;
    postEventFn = null;
    setPausedFn = null;
    error.value = reason;
    state.value = reason ? "failed" : "idle";
  }

  function postEvent(type: number, data1 = 0, data2 = 0, data3 = 0, data4 = 0) {
    postEventFn?.(type, data1, data2, data3, data4);
  }

  function pressKey(key: number, down: boolean) {
    postEvent(down ? EV_KEYDOWN : EV_KEYUP, key);
  }

  function setPaused(paused: boolean) {
    setPausedFn?.(paused ? 1 : 0);
  }

  /** The engine's audio context, once SDL opened it (to resume it after a gesture). */
  function audioContext(): AudioContext | undefined {
    return instance?.SDL2?.audioContext;
  }

  function readFile(path: string): Uint8Array | null {
    return instance?.FS.readFile(path) ?? null;
  }

  return { state: readonly(state), error: readonly(error), start, postEvent, pressKey, setPaused, audioContext, readFile };
}
