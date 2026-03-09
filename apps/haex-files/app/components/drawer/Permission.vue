<template>
  <!-- Permission Prompt Required (code 1004) -->
  <UiDrawerModal
    v-model:open="isPromptOpen"
    :title="t('prompt.title')"
    :description="t('prompt.description')"
    content-class="sm:max-w-md"
  >
    <template #content>
      <div class="space-y-4 py-4">
        <!-- Permission Info -->
        <div class="flex items-start gap-3 p-4 rounded-lg border border-warning bg-warning/10">
          <ShieldAlert class="size-6 text-warning shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-medium">{{ t("prompt.accessRequired") }}</p>
            <p class="text-sm text-muted-foreground mt-1">
              {{ t("prompt.accessDescription") }}
            </p>
          </div>
        </div>

        <!-- Target Info -->
        <div v-if="pendingPermission" class="space-y-2">
          <div class="text-sm font-medium">{{ t("target") }}</div>
          <div class="p-3 rounded-md bg-muted font-mono text-sm break-all">
            {{ pendingPermission.target }}
          </div>

          <div class="text-sm font-medium mt-4">{{ t("action") }}</div>
          <div class="p-3 rounded-md bg-muted text-sm">
            {{ pendingPermission.action }}
          </div>
        </div>

        <!-- Instructions -->
        <div class="text-sm text-muted-foreground">
          {{ t("prompt.instructions") }}
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <ShadcnButton variant="outline" @click="isPromptOpen = false">
          {{ t("cancel") }}
        </ShadcnButton>
        <ShadcnButton :loading="isRetrying" @click="onRetry">
          <RefreshCw class="size-4 mr-2" />
          {{ t("retry") }}
        </ShadcnButton>
      </div>
    </template>
  </UiDrawerModal>

  <!-- Permission Denied (code 1002) -->
  <UiDrawerModal
    v-model:open="isDeniedOpen"
    :title="t('denied.title')"
    :description="t('denied.description')"
    content-class="sm:max-w-md"
  >
    <template #content>
      <div class="space-y-4 py-4">
        <!-- Permission Denied Info -->
        <div class="flex items-start gap-3 p-4 rounded-lg border border-destructive bg-destructive/10">
          <ShieldX class="size-6 text-destructive shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-medium">{{ t("denied.accessDenied") }}</p>
            <p class="text-sm text-muted-foreground mt-1">
              {{ t("denied.accessDescription") }}
            </p>
          </div>
        </div>

        <!-- Target Info -->
        <div v-if="deniedPermission" class="space-y-2">
          <div class="text-sm font-medium">{{ t("target") }}</div>
          <div class="p-3 rounded-md bg-muted font-mono text-sm break-all">
            {{ deniedPermission.target }}
          </div>

          <div class="text-sm font-medium mt-4">{{ t("action") }}</div>
          <div class="p-3 rounded-md bg-muted text-sm">
            {{ deniedPermission.action }}
          </div>
        </div>

        <!-- Instructions -->
        <div class="text-sm text-muted-foreground">
          {{ t("denied.instructions") }}
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <ShadcnButton variant="outline" @click="isDeniedOpen = false">
          {{ t("close") }}
        </ShadcnButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { ShieldAlert, ShieldX, RefreshCw } from "lucide-vue-next";

const { t } = useI18n();
const haexVaultStore = useHaexVaultStore();

const isRetrying = ref(false);

// Permission Prompt (code 1004)
const isPromptOpen = computed({
  get: () => haexVaultStore.pendingPermission !== null,
  set: (value) => {
    if (!value) {
      haexVaultStore.clearPermissionPrompt();
    }
  },
});

const pendingPermission = computed(() => haexVaultStore.pendingPermission);

const onRetry = async () => {
  isRetrying.value = true;
  try {
    await haexVaultStore.retryAfterPermissionAsync();
  } finally {
    isRetrying.value = false;
  }
};

// Permission Denied (code 1002)
const isDeniedOpen = computed({
  get: () => haexVaultStore.deniedPermission !== null,
  set: (value) => {
    if (!value) {
      haexVaultStore.clearPermissionDenied();
    }
  },
});

const deniedPermission = computed(() => haexVaultStore.deniedPermission);
</script>

<i18n lang="yaml">
de:
  target: Ressource
  action: Aktion
  cancel: Abbrechen
  close: Schließen
  retry: Erneut versuchen
  prompt:
    title: Berechtigung erforderlich
    description: haex-files benötigt Zugriff auf eine Ressource
    accessRequired: Zugriff angefragt
    accessDescription: haex-vault zeigt einen Dialog an, um deine Zustimmung einzuholen.
    instructions: Bitte wechsle zu haex-vault und erteile die Berechtigung. Klicke danach auf "Erneut versuchen".
  denied:
    title: Berechtigung verweigert
    description: Der Zugriff auf eine Ressource wurde verweigert
    accessDenied: Zugriff verweigert
    accessDescription: Du hast den Zugriff auf diese Ressource in haex-vault verweigert.
    instructions: Um die Synchronisierung fortzusetzen, öffne haex-vault, gehe zu Einstellungen > Berechtigungen und erteile die Berechtigung für haex-files.

en:
  target: Resource
  action: Action
  cancel: Cancel
  close: Close
  retry: Retry
  prompt:
    title: Permission required
    description: haex-files needs access to a resource
    accessRequired: Access requested
    accessDescription: haex-vault is displaying a dialog to request your approval.
    instructions: Please switch to haex-vault and grant the permission. Then click "Retry".
  denied:
    title: Permission denied
    description: Access to a resource was denied
    accessDenied: Access denied
    accessDescription: You have denied access to this resource in haex-vault.
    instructions: To continue syncing, open haex-vault, go to Settings > Permissions and grant the permission for haex-files.
</i18n>
