/** True when the app was started without the host (`HAEX_STANDALONE=1 pnpm dev`); always false in a release build. */
export function useStandalone(): boolean {
  return import.meta.dev && useRuntimeConfig().public.standalone === true
}
