import { createTools, type ToolDeps } from "~/tools";

/**
 * Offers the agent of the host the tools declared in the manifest (spec 019). The handlers run
 * when the host calls them, also while no page of haex-mail was opened, so each one first waits for
 * the app to start (database, migrations, accounts) through `deps`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const stores = () =>
    nuxtApp.runWithContext(() => ({
      haexVault: useHaexVaultStore(),
      accountsStore: useAccountsStore(),
      mailStore: useMailStore(),
      rulesStore: useRulesStore(),
    }));

  const deps = async (): Promise<ToolDeps> => {
    const { haexVault, accountsStore, mailStore, rulesStore } = await stores();
    await haexVault.initializeAsync();
    await accountsStore.loadAccountsAsync();
    return {
      rules: rulesStore,
      applyRuleToExistingAsync: mailStore.applyRuleToExistingAsync,
    };
  };

  /** Returns whether the tools were registered; the vault client may not exist yet. */
  const register = async (): Promise<boolean> => {
    let client;
    try {
      client = (await stores()).haexVault.client;
    } catch {
      return false;
    }
    for (const [name, handler] of Object.entries(createTools(deps))) {
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
