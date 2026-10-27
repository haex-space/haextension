/** Keeps the app locale in sync with the locale of the host vault. */
export function useHostLocale() {
  const { $haexVault } = useNuxtApp()
  const { defaultLocale, locales, setLocale } = useI18n({ useScope: 'global' })

  watch(
    () => $haexVault?.state.value.context?.locale,
    (hostLocale) => {
      if (!hostLocale) return
      const locale = locales.value.find(l => l.code === hostLocale)?.code ?? defaultLocale
      setLocale(locale).catch((error: unknown) => {
        console.error('[haex-puzzle] Failed to switch locale:', error)
      })
    },
    { immediate: true },
  )
}
