<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'
import type { SupportedLocale } from '~/locales'
import { getLocaleSetting, setLocale, useI18n } from '~/locales'

const { t } = useI18n()

const currentLocale = ref<SupportedLocale>('auto')

const languageOptions = computed(() => [
  { value: 'auto', label: t('languageAuto') },
  { value: 'en', label: t('languageEnglish') },
  { value: 'de', label: t('languageGerman') },
])

async function handleLocaleChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const newLocale = target.value as SupportedLocale
  currentLocale.value = newLocale
  await setLocale(newLocale)
}

onMounted(async () => {
  currentLocale.value = await getLocaleSetting()
})
</script>

<template>
  <main class="min-h-screen bg-background text-foreground p-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="flex items-center gap-4 mb-8">
        <ShieldCheck class="w-12 h-12 text-primary" />
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('extensionName') }}
          </h1>
          <p class="text-muted-foreground">
            {{ t('settingsTitle') }}
          </p>
        </div>
      </div>

      <!-- Settings -->
      <div class="space-y-6">
        <!-- Language Setting -->
        <div class="rounded-lg border p-4">
          <label for="language-select" class="block font-medium mb-1">
            {{ t('settingsLanguage') }}
          </label>
          <p class="text-sm text-muted-foreground mb-3">
            {{ t('settingsLanguageDescription') }}
          </p>
          <select
            id="language-select"
            :value="currentLocale"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            @change="handleLocaleChange"
          >
            <option
              v-for="option in languageOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </main>
</template>
