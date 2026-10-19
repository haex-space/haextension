export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();
  const isInitialized = ref(false);

  const { currentThemeName } = storeToRefs(useUiStore());
  const { defaultLocale, locales, setLocale } = useI18n();

  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault;
    if (!haexVault) throw new Error("HaexVault plugin not available.");
    return haexVault;
  };

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
        currentThemeName.value = newContext.theme === "light" ? "light" : "dark";
        const locale = locales.value.find((l) => l.code === newContext.locale)?.code || defaultLocale;
        setLocale(locale);
      },
      { immediate: true },
    );

    isInitialized.value = true;
  };

  return {
    get client() { return getHaexVault().client; },
    get state() { return getHaexVault().state; },
    initializeAsync,
  };
});
