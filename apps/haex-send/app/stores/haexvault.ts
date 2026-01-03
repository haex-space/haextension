// stores/haexvault.ts

export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();

  const isInitialized = ref(false);

  // Get composables at the top of the store setup
  const { currentThemeName, context } = storeToRefs(useUiStore());
  const { defaultLocale, locales, setLocale } = useI18n();

  // Lazy getter for haexVault to ensure plugin is loaded
  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault;
    if (!haexVault) {
      throw new Error("HaexVault plugin not available. Make sure the store is only used client-side.");
    }
    return haexVault;
  };

  // Initialize and setup hook (runs once)
  const initializeAsync = async () => {
    if (isInitialized.value) return;

    const haexVault = getHaexVault();

    console.log("[haex-send] Initializing HaexVault SDK");

    // Register setup hook (no database migrations needed for haex-send)
    haexVault.client.onSetup(async () => {
      console.log("[haex-send] Setup hook running");
    });

    // Trigger setup
    await haexVault.client.setupComplete();
    console.log("[haex-send] Setup complete");

    // Setup context watcher
    watch(
      () => haexVault.state.value.context,
      (newContext) => {
        console.log("[haex-send] Context changed:", newContext);
        if (!newContext) return;

        context.value = newContext;
        currentThemeName.value = newContext.theme || "dark";

        const locale =
          locales.value.find((l) => l.code === newContext.locale)?.code ||
          defaultLocale;

        setLocale(locale);
      },
      { immediate: true }
    );

    isInitialized.value = true;
  };

  // Wait for setup to complete
  const waitForSetupAsync = async () => {
    const haexVault = getHaexVault();
    if (haexVault.state.value.isSetupComplete) return;

    console.log("[haex-send] Waiting for setup completion...");
    await haexVault.client.setupComplete();
    console.log("[haex-send] Setup complete");
  };

  return {
    get client() {
      return getHaexVault().client;
    },
    get state() {
      return getHaexVault().state;
    },
    initializeAsync,
    waitForSetupAsync,
  };
});
