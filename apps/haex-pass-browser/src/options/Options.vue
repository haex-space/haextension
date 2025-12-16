<script setup lang="ts">
import type { SupportedLocale } from '~/locales'
import { getLocaleSetting, setLocale, useI18n } from '~/locales'
import { getWebSocketPort, setWebSocketPort } from '~/logic/settings'
import logoUrl from '../../extension/assets/haex-pass-logo.png'

const { t } = useI18n()

const currentLocale = ref<SupportedLocale>('auto')
const currentPort = ref<number>(19455)
const portInput = ref<string>('19455')
const portError = ref<string | null>(null)
const portSaved = ref(false)

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

async function handlePortSave() {
  const port = Number.parseInt(portInput.value, 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    portError.value = t('settingsPortInvalid')
    return
  }

  portError.value = null
  await setWebSocketPort(port)
  currentPort.value = port
  portSaved.value = true
  setTimeout(() => {
    portSaved.value = false
  }, 2000)
}

function handlePortInput(event: Event) {
  const target = event.target as HTMLInputElement
  portInput.value = target.value
  portError.value = null
  portSaved.value = false
}

onMounted(async () => {
  currentLocale.value = await getLocaleSetting()
  currentPort.value = await getWebSocketPort()
  portInput.value = currentPort.value.toString()
})
</script>

<template>
  <main class="min-h-screen bg-background text-foreground p-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="flex items-center gap-4 mb-8">
        <img :src="logoUrl" alt="haex-pass" class="w-12 h-12">
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

        <!-- Connection Setting -->
        <div class="rounded-lg border p-4">
          <h3 class="font-medium mb-1">
            {{ t('settingsConnection') }}
          </h3>
          <p class="text-sm text-muted-foreground mb-4">
            {{ t('settingsConnectionDescription') }}
          </p>

          <div class="space-y-3">
            <div>
              <label for="port-input" class="block text-sm font-medium mb-1">
                {{ t('settingsPort') }}
              </label>
              <p class="text-xs text-muted-foreground mb-2">
                {{ t('settingsPortDescription') }}
              </p>
              <div class="flex gap-2">
                <input
                  id="port-input"
                  type="number"
                  min="1"
                  max="65535"
                  :value="portInput"
                  :placeholder="t('settingsPortPlaceholder')"
                  class="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  @input="handlePortInput"
                >
                <button
                  class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  :disabled="portInput === currentPort.toString()"
                  @click="handlePortSave"
                >
                  {{ t('settingsSave') }}
                </button>
              </div>
              <p v-if="portError" class="text-sm text-red-500 mt-1">
                {{ portError }}
              </p>
              <p v-else-if="portSaved" class="text-sm text-green-500 mt-1">
                {{ t('settingsSaved') }}
              </p>
            </div>

            <p v-if="portSaved" class="text-xs text-amber-500">
              {{ t('settingsRestartRequired') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
