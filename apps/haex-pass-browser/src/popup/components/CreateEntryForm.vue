<script setup lang="ts">
import type { GetPasswordConfigResponseData } from '~/logic/messages'
import { Check, Eye, EyeOff, Key, Loader2, X } from 'lucide-vue-next'
import { useI18n } from '~/locales'
import { MSG_CREATE_ITEM, MSG_GET_PASSWORD_CONFIG } from '~/logic/messages'
import { generatePassword, defaultPasswordConfig } from '~/logic/passwordGenerator'
import PasswordGenerator from './PasswordGenerator.vue'

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const showPasswordGenerator = ref(false)
const createForm = ref({
  title: '',
  url: '',
  username: '',
  password: '',
})
const isCreating = ref(false)
const createSuccess = ref(false)
const createError = ref<string | null>(null)
const showPassword = ref(false)

async function getCurrentTabUrl() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.url) {
      createForm.value.url = tab.url
      // Extract domain for title
      try {
        const urlObj = new URL(tab.url)
        createForm.value.title = urlObj.hostname.replace(/^www\./, '')
      } catch {
        createForm.value.title = ''
      }
    }
  } catch (err) {
    console.error('Failed to get current tab:', err)
  }
}

async function generateInitialPassword() {
  try {
    // Try to load remote config from haex-pass
    const response = await browser.runtime.sendMessage({ type: MSG_GET_PASSWORD_CONFIG }) as {
      success: boolean
      data?: GetPasswordConfigResponseData
      error?: string
    }

    if (response.success && response.data?.config) {
      const remoteConfig = response.data.config
      createForm.value.password = generatePassword({
        length: remoteConfig.length,
        uppercase: remoteConfig.uppercase,
        lowercase: remoteConfig.lowercase,
        numbers: remoteConfig.numbers,
        symbols: remoteConfig.symbols,
        excludeChars: remoteConfig.excludeChars ?? '',
        usePattern: remoteConfig.usePattern,
        pattern: remoteConfig.pattern ?? '',
      })
      showPassword.value = true // Show password so user can see the generated one
      console.log('[CreateEntryForm] Generated password with remote config')
    } else {
      // Use default config
      createForm.value.password = generatePassword(defaultPasswordConfig)
      showPassword.value = true
      console.log('[CreateEntryForm] Generated password with default config')
    }
  } catch (err) {
    // Fallback to default
    createForm.value.password = generatePassword(defaultPasswordConfig)
    showPassword.value = true
    console.log('[CreateEntryForm] Generated password with fallback config:', err)
  }
}

function closeForm() {
  showPasswordGenerator.value = false
  createForm.value = { title: '', url: '', username: '', password: '' }
  createError.value = null
  emit('close')
}

async function submitForm() {
  if (!createForm.value.url && !createForm.value.title) {
    createError.value = t('createEntry.error')
    return
  }

  isCreating.value = true
  createError.value = null

  try {
    const response = await browser.runtime.sendMessage({
      type: MSG_CREATE_ITEM,
      data: {
        title: createForm.value.title || undefined,
        url: createForm.value.url || undefined,
        username: createForm.value.username || undefined,
        password: createForm.value.password || undefined,
      },
    })

    const result = response as { success: boolean, error?: string }
    if (result.success) {
      createSuccess.value = true
      setTimeout(() => {
        closeForm()
        createSuccess.value = false
      }, 1500)
    } else {
      createError.value = result.error || t('createEntry.error')
    }
  } catch (err) {
    console.error('Failed to create entry:', err)
    createError.value = t('createEntry.error')
  } finally {
    isCreating.value = false
  }
}

function openPasswordGenerator(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  console.log('[CreateEntryForm] Opening password generator, current state:', showPasswordGenerator.value)
  try {
    showPasswordGenerator.value = true
    console.log('[CreateEntryForm] Password generator state set to:', showPasswordGenerator.value)
  } catch (err) {
    console.error('[CreateEntryForm] Error opening password generator:', err)
  }
}

function closePasswordGenerator() {
  showPasswordGenerator.value = false
}

function usePassword(password: string) {
  createForm.value.password = password
  showPasswordGenerator.value = false
}

onMounted(() => {
  getCurrentTabUrl()
  generateInitialPassword()
})
</script>

<template>
  <!-- Password Generator -->
  <PasswordGenerator
    v-if="showPasswordGenerator"
    @close="closePasswordGenerator"
    @use="usePassword"
  />

  <!-- Create Entry Form -->
  <div v-else class="rounded-lg border p-3 mb-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-medium text-sm">
        {{ t('createEntry.title') }}
      </h3>
      <button
        class="text-muted-foreground hover:text-foreground"
        @click="closeForm"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <p class="text-xs text-muted-foreground mb-3">
      {{ t('createEntry.description') }}
    </p>

    <form class="space-y-3" @submit.prevent="submitForm">
      <div>
        <label class="block text-xs font-medium mb-1">
          {{ t('createEntry.fieldTitle') }}
        </label>
        <input
          v-model="createForm.title"
          type="text"
          :placeholder="t('createEntry.fieldTitlePlaceholder')"
          class="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
      </div>

      <div>
        <label class="block text-xs font-medium mb-1">
          {{ t('createEntry.fieldUrl') }}
        </label>
        <input
          v-model="createForm.url"
          type="text"
          class="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
      </div>

      <div>
        <label class="block text-xs font-medium mb-1">
          {{ t('createEntry.fieldUsername') }}
        </label>
        <input
          v-model="createForm.username"
          type="text"
          :placeholder="t('createEntry.fieldUsernamePlaceholder')"
          class="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
      </div>

      <div>
        <label class="block text-xs font-medium mb-1">
          {{ t('createEntry.fieldPassword') }}
        </label>
        <div class="flex gap-1">
          <input
            v-model="createForm.password"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('createEntry.fieldPasswordPlaceholder')"
            class="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm hover:bg-accent"
            :title="t('createEntry.togglePassword')"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" class="w-4 h-4" />
            <Eye v-else class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm hover:bg-accent"
            :title="t('createEntry.generatePassword')"
            @click.stop.prevent="openPasswordGenerator($event)"
          >
            <Key class="w-4 h-4" />
          </button>
        </div>
      </div>

      <p v-if="createError" class="text-xs text-red-500">
        {{ createError }}
      </p>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          class="flex-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          @click="closeForm"
        >
          {{ t('createEntry.cancel') }}
        </button>
        <button
          type="submit"
          class="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          :disabled="isCreating || createSuccess"
        >
          <Loader2 v-if="isCreating" class="w-4 h-4 animate-spin" />
          <Check v-else-if="createSuccess" class="w-4 h-4" />
          <template v-else>
            {{ t('createEntry.save') }}
          </template>
        </button>
      </div>
    </form>
  </div>
</template>
