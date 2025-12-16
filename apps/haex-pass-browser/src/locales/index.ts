import { createI18n } from 'vue-i18n'
import type { Ref } from 'vue'
import en from './en'
import de from './de'

export const SUPPORTED_LOCALES = ['auto', 'en', 'de'] as const
export type SupportedLocale = typeof SUPPORTED_LOCALES[number]
export type Locale = 'en' | 'de'

const STORAGE_KEY = 'haex-pass-locale'

/**
 * Get the browser's preferred locale
 * Falls back to 'en' if the locale is not supported
 */
export function getBrowserLocale(): Locale {
  const browserLocale = navigator.language.split('-')[0]
  return ['en', 'de'].includes(browserLocale) ? browserLocale as Locale : 'en'
}

/**
 * Resolve the actual locale from storage setting
 * 'auto' means use browser locale
 */
export function resolveLocale(setting: SupportedLocale): Locale {
  return setting === 'auto' ? getBrowserLocale() : setting
}

export const i18n = createI18n({
  legacy: false,
  locale: getBrowserLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    de,
  },
})

/**
 * Initialize i18n from storage
 * Call this once when the app starts
 */
export async function initI18nFromStorage(): Promise<void> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    const setting = (result[STORAGE_KEY] as SupportedLocale) || 'auto'
    ;(i18n.global.locale as unknown as Ref<string>).value = resolveLocale(setting)
  }
  catch {
    // Storage not available, use browser locale
  }
}

/**
 * Set the locale and save to storage
 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: locale })
  ;(i18n.global.locale as unknown as Ref<string>).value = resolveLocale(locale)
}

/**
 * Get the current locale setting from storage
 */
export async function getLocaleSetting(): Promise<SupportedLocale> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    return (result[STORAGE_KEY] as SupportedLocale) || 'auto'
  }
  catch {
    return 'auto'
  }
}

export { useI18n } from 'vue-i18n'
