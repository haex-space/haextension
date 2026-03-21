import {
  isPermissionPromptError,
  isPermissionDeniedError,
  type PermissionPromptError,
  type PermissionDeniedError,
} from "@haex-space/vault-sdk";

export { isPermissionPromptError, isPermissionDeniedError, type PermissionPromptError, type PermissionDeniedError };

export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();
  const isInitialized = ref(false);

  const pendingPermission = ref<PermissionPromptError | null>(null);
  const pendingRetryFn = shallowRef<(() => Promise<void>) | null>(null);
  const deniedPermission = ref<PermissionDeniedError | null>(null);

  const { currentThemeName, context } = storeToRefs(useUiStore());
  const { defaultLocale, locales, setLocale } = useI18n();

  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault;
    if (!haexVault) throw new Error("HaexVault plugin not available.");
    return haexVault;
  };

  const sdk = computed(() => {
    try {
      return getHaexVault().client;
    } catch {
      return null;
    }
  });

  const initializeAsync = async () => {
    if (isInitialized.value) return;
    const haexVault = getHaexVault();

    console.log("[haex-image] Initializing HaexVault SDK");
    haexVault.client.onSetup(async () => {});
    await haexVault.client.setupComplete();
    console.log("[haex-image] Setup complete");

    watch(
      () => haexVault.state.value.context,
      (newContext) => {
        if (!newContext) return;
        context.value = newContext;
        currentThemeName.value = newContext.theme === "light" ? "light" : "dark";
        const locale = locales.value.find((l) => l.code === newContext.locale)?.code || defaultLocale;
        setLocale(locale);
      },
      { immediate: true },
    );

    isInitialized.value = true;
  };

  const setPermissionPrompt = (error: PermissionPromptError, retryFn: () => Promise<void>) => {
    pendingPermission.value = error;
    pendingRetryFn.value = retryFn;
  };
  const clearPermissionPrompt = () => {
    pendingPermission.value = null;
    pendingRetryFn.value = null;
  };
  const retryAfterPermissionAsync = async () => {
    const retryFn = pendingRetryFn.value;
    if (retryFn) {
      clearPermissionPrompt();
      await retryFn();
    }
  };
  const setPermissionDenied = (error: PermissionDeniedError) => { deniedPermission.value = error; };
  const clearPermissionDenied = () => { deniedPermission.value = null; };

  return {
    get client() { return getHaexVault().client; },
    get state() { return getHaexVault().state; },
    sdk,
    isReady: computed(() => isInitialized.value),
    initializeAsync,
    pendingPermission: computed(() => pendingPermission.value),
    setPermissionPrompt,
    clearPermissionPrompt,
    retryAfterPermissionAsync,
    deniedPermission: computed(() => deniedPermission.value),
    setPermissionDenied,
    clearPermissionDenied,
  };
});
