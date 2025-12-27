<script setup lang="ts">
import type { PasswordConfig } from '~/logic/passwordGenerator'
import type { GetPasswordPresetsResponseData, PasswordPreset } from '~/logic/messages'
import { Check, ChevronLeft, Copy, HelpCircle, RefreshCw } from 'lucide-vue-next'
import { useI18n } from '~/locales'
import { defaultPasswordConfig, generatePassword } from '~/logic/passwordGenerator'
import { MSG_GET_PASSWORD_PRESETS } from '~/logic/messages'

const emit = defineEmits<{
  close: []
  use: [password: string]
}>()

const { t } = useI18n()

const showPatternHelp = ref(false)
const generatedPassword = ref('')
const passwordCopied = ref(false)
const passwordConfig = ref<PasswordConfig>({ ...defaultPasswordConfig })
const presets = ref<PasswordPreset[]>([])
const selectedPresetId = ref<string | null>(null)

async function loadRemotePresets() {
  try {
    const response = await browser.runtime.sendMessage({ type: MSG_GET_PASSWORD_PRESETS }) as {
      success: boolean
      data?: GetPasswordPresetsResponseData
      error?: string
    }

    if (response.success && response.data?.presets) {
      presets.value = response.data.presets
      console.log('[PasswordGenerator] Loaded presets from haex-pass:', presets.value.length)

      // Auto-select default preset if exists
      const defaultPreset = presets.value.find(p => p.isDefault)
      if (defaultPreset) {
        loadPreset(defaultPreset)
      } else if (presets.value.length > 0) {
        // If no default, select first preset
        loadPreset(presets.value[0])
      } else {
        regeneratePassword()
      }
    } else {
      console.log('[PasswordGenerator] No presets available, using defaults')
      regeneratePassword()
    }
  } catch (err) {
    console.log('[PasswordGenerator] Could not load presets:', err)
    regeneratePassword()
  }
}

function loadPreset(preset: PasswordPreset) {
  selectedPresetId.value = preset.id
  passwordConfig.value = {
    length: preset.config.length,
    uppercase: preset.config.uppercase,
    lowercase: preset.config.lowercase,
    numbers: preset.config.numbers,
    symbols: preset.config.symbols,
    excludeChars: preset.config.excludeChars ?? '',
    usePattern: preset.config.usePattern,
    pattern: preset.config.pattern ?? '',
  }
  regeneratePassword()
}

function regeneratePassword() {
  generatedPassword.value = generatePassword(passwordConfig.value)
}

function useGeneratedPassword() {
  emit('use', generatedPassword.value)
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(generatedPassword.value)
    passwordCopied.value = true
    setTimeout(() => {
      passwordCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('Failed to copy password:', err)
  }
}

function toggleOption(option: 'uppercase' | 'lowercase' | 'numbers' | 'symbols') {
  passwordConfig.value[option] = !passwordConfig.value[option]
  regeneratePassword()
}

// Watch for pattern mode changes
watch(() => passwordConfig.value.usePattern, () => {
  regeneratePassword()
})

watch(() => passwordConfig.value.pattern, () => {
  if (passwordConfig.value.usePattern) {
    regeneratePassword()
  }
})

onMounted(() => {
  console.log('[PasswordGenerator] Component mounted')
  loadRemotePresets()
})
</script>

<template>
  <div class="rounded-lg border p-3 mb-4">
    <div class="flex items-center justify-between mb-3">
      <button
        class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        @click="emit('close')"
      >
        <ChevronLeft class="w-4 h-4" />
        {{ t('passwordGenerator.cancel') }}
      </button>
      <h3 class="font-medium text-sm">
        {{ t('passwordGenerator.title') }}
      </h3>
    </div>

    <div class="space-y-3">
      <!-- Preset Selector -->
      <div v-if="presets.length > 0">
        <label class="block text-xs font-medium mb-1">
          {{ t('passwordGenerator.preset') }}
        </label>
        <select
          :value="selectedPresetId"
          class="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          @change="(e) => {
            const preset = presets.find(p => p.id === (e.target as HTMLSelectElement).value)
            if (preset) loadPreset(preset)
          }"
        >
          <option v-for="preset in presets" :key="preset.id" :value="preset.id">
            {{ preset.name }}{{ preset.isDefault ? ` (${t('passwordGenerator.default')})` : '' }}
          </option>
        </select>
      </div>

      <!-- Generated Password Display -->
      <div class="flex gap-1">
        <input
          :value="generatedPassword"
          type="text"
          readonly
          class="flex-1 rounded-md border bg-muted px-2 py-1.5 text-sm font-mono"
        >
        <button
          type="button"
          class="rounded-md border px-2 py-1.5 hover:bg-accent"
          @click="regeneratePassword"
        >
          <RefreshCw class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="rounded-md border px-2 py-1.5 hover:bg-accent"
          @click="copyPassword"
        >
          <Check v-if="passwordCopied" class="w-4 h-4 text-green-500" />
          <Copy v-else class="w-4 h-4" />
        </button>
      </div>

      <!-- Length Slider -->
      <div>
        <label class="block text-xs font-medium mb-1">
          {{ t('passwordGenerator.length') }}: {{ passwordConfig.length }}
        </label>
        <input
          v-model.number="passwordConfig.length"
          type="range"
          min="4"
          max="64"
          class="w-full"
          @input="regeneratePassword"
        >
      </div>

      <!-- Character Type Toggles -->
      <div class="flex gap-1 flex-wrap">
        <button
          type="button"
          class="px-2 py-1 text-xs rounded-md border"
          :class="passwordConfig.uppercase ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'"
          @click="toggleOption('uppercase')"
        >
          {{ t('passwordGenerator.uppercase') }}
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs rounded-md border"
          :class="passwordConfig.lowercase ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'"
          @click="toggleOption('lowercase')"
        >
          {{ t('passwordGenerator.lowercase') }}
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs rounded-md border"
          :class="passwordConfig.numbers ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'"
          @click="toggleOption('numbers')"
        >
          {{ t('passwordGenerator.numbers') }}
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs rounded-md border"
          :class="passwordConfig.symbols ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'"
          @click="toggleOption('symbols')"
        >
          {{ t('passwordGenerator.symbols') }}
        </button>
      </div>

      <!-- Exclude Characters -->
      <div>
        <label class="block text-xs font-medium mb-1">
          {{ t('passwordGenerator.excludeChars') }}
        </label>
        <input
          v-model="passwordConfig.excludeChars"
          type="text"
          :placeholder="t('passwordGenerator.excludeCharsPlaceholder')"
          class="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          @input="regeneratePassword"
        >
      </div>

      <!-- Pattern Mode Toggle -->
      <div class="flex items-center gap-2">
        <input
          id="usePattern"
          v-model="passwordConfig.usePattern"
          type="checkbox"
          class="rounded"
        >
        <label for="usePattern" class="text-xs font-medium cursor-pointer">
          {{ t('passwordGenerator.usePattern') }}
        </label>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground"
          @click="showPatternHelp = !showPatternHelp"
        >
          <HelpCircle class="w-4 h-4" />
        </button>
      </div>

      <!-- Pattern Help -->
      <div v-if="showPatternHelp" class="text-xs bg-muted rounded-md p-2 space-y-1">
        <p class="font-medium">
          {{ t('passwordGenerator.patternHelp.title') }}
        </p>
        <ul class="space-y-0.5 text-muted-foreground">
          <li><code class="bg-background px-1 rounded">c</code> = {{ t('passwordGenerator.patternHelp.c') }}</li>
          <li><code class="bg-background px-1 rounded">C</code> = {{ t('passwordGenerator.patternHelp.C') }}</li>
          <li><code class="bg-background px-1 rounded">v</code> = {{ t('passwordGenerator.patternHelp.v') }}</li>
          <li><code class="bg-background px-1 rounded">V</code> = {{ t('passwordGenerator.patternHelp.V') }}</li>
          <li><code class="bg-background px-1 rounded">d</code> = {{ t('passwordGenerator.patternHelp.d') }}</li>
          <li><code class="bg-background px-1 rounded">a</code> = {{ t('passwordGenerator.patternHelp.a') }}</li>
          <li><code class="bg-background px-1 rounded">A</code> = {{ t('passwordGenerator.patternHelp.A') }}</li>
          <li><code class="bg-background px-1 rounded">s</code> = {{ t('passwordGenerator.patternHelp.s') }}</li>
          <li>{{ t('passwordGenerator.patternHelp.other') }}</li>
        </ul>
      </div>

      <!-- Pattern Input -->
      <div v-if="passwordConfig.usePattern">
        <label class="block text-xs font-medium mb-1">
          {{ t('passwordGenerator.pattern') }}
        </label>
        <input
          v-model="passwordConfig.pattern"
          type="text"
          :placeholder="t('passwordGenerator.patternPlaceholder')"
          class="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-mono"
        >
      </div>

      <!-- Use Button -->
      <button
        type="button"
        class="w-full rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
        @click="useGeneratedPassword"
      >
        {{ t('passwordGenerator.use') }}
      </button>
    </div>
  </div>
</template>
