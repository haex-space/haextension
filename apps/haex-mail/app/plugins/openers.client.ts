import { toast } from "vue-sonner";
import { listenForOpenRequests, handleOpenRequest, type OpenerDeps } from "~/lib/openers";

/**
 * Opens the compose dialog when the host hands haex-mail a mail link (kind `mail.compose` in the
 * manifest, spec 063). The request is taken when the frame starts, because the frame the choice
 * itself opened misses the event, and again for each request that arrives while it is open.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const buildDeps = async (): Promise<OpenerDeps> => {
    const { haexVault, accountsStore, uiStore, i18n } = await nuxtApp.runWithContext(() => ({
      haexVault: useHaexVaultStore(),
      accountsStore: useAccountsStore(),
      uiStore: useUiStore(),
      i18n: useNuxtApp().$i18n,
    }));
    return {
      hasAccounts: async () => {
        await haexVault.initializeAsync();
        await accountsStore.loadAccountsAsync();
        return accountsStore.hasAccounts;
      },
      openCompose: async (prefill) => {
        uiStore.composePrefill = prefill;
        await nuxtApp.runWithContext(() => navigateTo("/"));
      },
      notifyNoAccount: () => toast.info(i18n.t("openers.noAccount")),
    };
  };

  /** Returns whether the listener runs; the vault client may not exist yet. */
  const listen = (): boolean => {
    // Read the plugin directly, as `agent-tools.client.ts` does: the store's `client` getter throws
    // before the client exists, and Pinia keeps the half-built store.
    const client = (nuxtApp as ReturnType<typeof useNuxtApp>).$haexVault?.client;
    if (!client) return false;
    listenForOpenRequests(client.openers, async (request) =>
      handleOpenRequest(request, await buildDeps()),
    );
    return true;
  };

  if (!listen()) nuxtApp.hooks.hookOnce("app:mounted", () => void listen());
});
