<script setup lang="ts">
import { Plus, Settings } from 'lucide-vue-next'
import { useI18n } from '~/locales'
import logoUrl from '../../extension/assets/haex-pass-logo.png'
import ConnectionStatus from './components/ConnectionStatus.vue'
import CreateEntryForm from './components/CreateEntryForm.vue'

const { t } = useI18n()

const connectionStatusRef = ref<InstanceType<typeof ConnectionStatus> | null>(null)
const showCreateForm = ref(false)

const isPaired = computed(() => connectionStatusRef.value?.canSendRequests ?? false)

function openOptions() {
  browser.runtime.openOptionsPage()
}

function openCreateForm() {
  showCreateForm.value = true
}

function closeCreateForm() {
  showCreateForm.value = false
}
</script>

<template>
  <main class="w-[320px] p-4 bg-background text-foreground">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <img :src="logoUrl" alt="haex-pass" class="w-10 h-10">
      <div>
        <h1 class="text-lg font-semibold">
          {{ t('extension.name') }}
        </h1>
        <p class="text-xs text-muted-foreground">
          {{ t('extension.description') }}
        </p>
      </div>
    </div>

    <!-- Connection Status -->
    <ConnectionStatus ref="connectionStatusRef" />

    <!-- Quick Actions (when paired) -->
    <div v-if="isPaired && !showCreateForm" class="space-y-3 mb-4">
      <p class="text-xs text-muted-foreground">
        {{ t('hint.autoFillActive') }}
      </p>

      <!-- Create Entry Button -->
      <button
        class="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"
        @click="openCreateForm"
      >
        <Plus class="w-4 h-4" />
        {{ t('createEntry.label') }}
      </button>
    </div>

    <!-- Create Entry Form -->
    <CreateEntryForm v-if="showCreateForm" @close="closeCreateForm" />

    <!-- Footer -->
    <div class="pt-3 border-t mt-4">
      <button
        class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        @click="openOptions"
      >
        <Settings class="w-3 h-3" />
        {{ t('button.settings') }}
      </button>
    </div>
  </main>
</template>
