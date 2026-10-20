import { buildToolDeps } from "~/tools/deps";
import { createTools } from "~/tools";

/**
 * Offers the agent of the host the tools declared in the manifest (spec 019). The handlers run
 * when the host calls them, also while no page of haex-mail was opened; `buildToolDeps` waits for
 * the app to start first.
 */
export default defineNuxtPlugin((nuxtApp) => {
  /** Returns whether the tools were registered; the vault client may not exist yet. */
  const register = async (): Promise<boolean> => {
    let client;
    try {
      client = await nuxtApp.runWithContext(() => useHaexVaultStore().client);
    } catch {
      return false;
    }
    for (const [name, handler] of Object.entries(createTools(() => buildToolDeps(nuxtApp)))) {
      try {
        client.tools.register(name, handler);
      } catch (err) {
        // A tool the manifest does not declare (an older signed manifest): the others still work.
        console.warn(`[haex-mail] tool ${name} was not registered`, err);
      }
    }
    return true;
  };

  void register().then((done) => {
    if (!done) nuxtApp.hooks.hookOnce("app:mounted", () => void register());
  });
});
