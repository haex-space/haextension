<script setup lang="ts">
import { Mail } from "lucide-vue-next";
import type { PasswordItemSummary } from "@haex-space/vault-sdk";
import { getErrorMessage } from "~/lib/utils";

const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const accountsStore = useAccountsStore();

const isLoading = ref(true);
const items = ref<PasswordItemSummary[]>([]);
const selected = ref(new Set<string>());
const isImporting = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    items.value = await accountsStore.listImportableVaultAccountsAsync();
  } catch (err) {
    error.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
});

const toggle = (id: string) => {
  if (selected.value.has(id)) selected.value.delete(id);
  else selected.value.add(id);
};

const importSelectedAsync = async () => {
  error.value = null;
  isImporting.value = true;
  try {
    for (const id of selected.value) {
      await accountsStore.importAccountAsync(id);
    }
    emit("saved");
  } catch (err) {
    error.value = getErrorMessage(err);
    // Refresh so accounts imported before the failure don't linger as
    // selected, still-listed entries.
    try {
      items.value = await accountsStore.listImportableVaultAccountsAsync();
      selected.value.clear();
    } catch {
      // Keep the stale list — the import error above is already shown.
    }
  } finally {
    isImporting.value = false;
  }
};
</script>

<template>
  <div class="space-y-4">
    <p v-if="isLoading" class="text-sm text-muted-foreground">{{ t("loading") }}</p>

    <template v-else-if="items.length > 0">
      <p class="text-sm text-muted-foreground">{{ t("description") }}</p>
      <div class="space-y-2">
        <label
          v-for="item in items"
          :key="item.id"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 cursor-pointer"
        >
          <ShadcnCheckbox
            :model-value="selected.has(item.id)"
            class="border-muted-foreground/50"
            @update:model-value="toggle(item.id)"
          />
          <Mail class="w-4 h-4 shrink-0 text-muted-foreground" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ item.title || item.username }}</p>
            <p v-if="item.title && item.username" class="text-xs text-muted-foreground truncate">
              {{ item.username }}
            </p>
          </div>
        </label>
      </div>

      <div class="flex justify-end">
        <UiButton
          size="lg"
          :loading="isImporting"
          :disabled="selected.size === 0"
          @click="importSelectedAsync"
        >
          {{ t("import", { count: selected.size }, selected.size) }}
        </UiButton>
      </div>
    </template>

    <p v-else-if="!error" class="text-sm text-muted-foreground">{{ t("empty") }}</p>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
  </div>
</template>

<i18n lang="yaml">
de:
  loading: Suche nach vorhandenen Konten…
  description: Diese Konten wurden im Passwort-Tresor gefunden.
  empty: Keine vorhandenen Konten im Passwort-Tresor gefunden.
  import: "{count} Konto anlegen | {count} Konten anlegen"
en:
  loading: Looking for existing accounts…
  description: These accounts were found in the password store.
  empty: No existing accounts found in the password store.
  import: "Add {count} account | Add {count} accounts"
</i18n>
