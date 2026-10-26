import type { HaexImports } from "./imports";

/** Why the engine ended, as it reported itself (engine/patches/0006-exit-hooks.patch). */
export interface EngineExit {
  /** The engine stopped with I_Error (consistency failure, a failed connect, ...). */
  isError: boolean;
  /** The error text, or a notice for the player (the host left); empty for a plain Quit. */
  message: string;
}

/**
 * The imports with `engineExit` extended to record the exit; the handler that was there still
 * runs afterwards. The engine's messages end with a line break, which is cut off.
 */
export function recordEngineExit(imports: HaexImports, record: (exit: EngineExit) => void): HaexImports {
  return {
    ...imports,
    engineExit: (isError, message) => {
      record({ isError, message: message.trim() });
      imports.engineExit(isError, message);
    },
  };
}
