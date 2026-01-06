<template>
  <div>
    <NuxtPage />
    <ShadcnSonnerToaster />
    <HaexTransferRequestDialog />
    <div
      v-if="!haexVaultStore.state.isSetupComplete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background"
    >
      <div class="text-center">
        <div class="mb-4">{{ t("initializing") }}</div>
        <div class="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div class="h-full bg-primary animate-pulse" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const haexVaultStore = useHaexVaultStore();

onMounted(async () => {
  await haexVaultStore.initializeAsync();
  await haexVaultStore.waitForSetupAsync();
});
</script>

<i18n lang="yaml">
de:
  initializing: Initialisiere...
en:
  initializing: Initializing...
</i18n>
