<script setup lang="ts">
import { ArrowLeft, Mail, Pencil, Plus, Trash2 } from "lucide-vue-next";
import type * as schema from "~/database/schemas";

const { t } = useI18n();
const router = useRouter();
const haexVault = useHaexVaultStore();
const accountsStore = useAccountsStore();
const mailStore = useMailStore();

onMounted(async () => {
  await haexVault.initializeAsync();
  await accountsStore.loadAccountsAsync();
});

// --- Add / edit dialog ---
const showAccountDialog = ref(false);
const editAccount = ref<schema.SelectAccount | null>(null);

const openCreate = () => {
  editAccount.value = null;
  showAccountDialog.value = true;
};

const openEdit = (account: schema.SelectAccount) => {
  editAccount.value = account;
  showAccountDialog.value = true;
};

const onSaved = () => {
  showAccountDialog.value = false;
  editAccount.value = null;
};

// --- Delete confirmation ---
const showDeleteConfirm = ref(false);
const deleteAccountId = ref<string | null>(null);

const confirmDelete = (id: string) => {
  deleteAccountId.value = id;
  showDeleteConfirm.value = true;
};

const executeDeleteAsync = async () => {
  if (!deleteAccountId.value) return;
  const deletedId = deleteAccountId.value;
  await accountsStore.deleteAccountAsync(deletedId);
  // If the deleted account was selected, fall back to the first remaining one.
  if (mailStore.selectedAccountId === deletedId) {
    mailStore.selectAccount(accountsStore.accounts[0]?.id ?? null);
  }
  deleteAccountId.value = null;
  showDeleteConfirm.value = false;
};
</script>

<template>
  <div class="h-screen flex flex-col bg-background text-foreground">
    <header class="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        @click="router.push('/')"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>
      <h1 class="text-lg font-semibold">{{ t("title") }}</h1>
    </header>

    <div class="flex-1 overflow-y-auto p-6 max-w-lg mx-auto w-full space-y-8">
      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {{ t("accounts.title") }}
        </h2>

        <div
          v-for="account in accountsStore.accounts"
          :key="account.id"
          class="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted"
        >
          <Mail class="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ account.displayName }}</p>
            <p class="text-xs text-muted-foreground truncate">{{ account.email }}</p>
            <p class="text-xs text-muted-foreground truncate">
              {{ account.imapHost }}:{{ account.imapPort }}
            </p>
          </div>
          <button
            class="p-1.5 rounded-md hover:bg-background transition-colors shrink-0"
            :title="t('accounts.edit')"
            @click="openEdit(account)"
          >
            <Pencil class="w-4 h-4" />
          </button>
          <button
            class="p-1.5 rounded-md hover:bg-background transition-colors text-destructive shrink-0"
            :title="t('accounts.delete')"
            @click="confirmDelete(account.id)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>

        <p v-if="accountsStore.accounts.length === 0" class="text-sm text-muted-foreground">
          {{ t("accounts.empty") }}
        </p>

        <button
          class="flex items-center gap-2 w-full justify-center bg-muted hover:bg-muted/80 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          @click="openCreate"
        >
          <Plus class="w-4 h-4" />
          {{ t("accounts.add") }}
        </button>
      </section>
    </div>

    <!-- Add / edit account dialog -->
    <UiDrawerModal
      v-model:open="showAccountDialog"
      :title="editAccount ? t('accounts.editTitle') : t('accounts.addTitle')"
      content-class="max-w-2xl"
    >
      <template #content>
        <div class="p-4">
          <AccountForm
            :key="editAccount?.id ?? 'new'"
            :account="editAccount ?? undefined"
            @saved="onSaved"
          />
        </div>
      </template>
    </UiDrawerModal>

    <!-- Delete confirmation -->
    <UiDrawerModal
      v-model:open="showDeleteConfirm"
      :title="t('accounts.deleteConfirm.title')"
    >
      <template #content>
        <div class="p-4">
          <p class="text-sm text-muted-foreground">
            {{ t("accounts.deleteConfirm.description") }}
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <button
            class="text-muted-foreground px-3 py-2"
            @click="showDeleteConfirm = false"
          >
            {{ t("accounts.deleteConfirm.abort") }}
          </button>
          <button
            class="bg-destructive text-destructive-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
            @click="executeDeleteAsync"
          >
            {{ t("accounts.deleteConfirm.confirm") }}
          </button>
        </div>
      </template>
    </UiDrawerModal>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Einstellungen
  accounts:
    title: Mail-Konten
    empty: Noch keine Konten eingerichtet.
    add: Konto hinzufügen
    addTitle: Neues Mail-Konto
    edit: Konto bearbeiten
    editTitle: Konto bearbeiten
    delete: Konto entfernen
    deleteConfirm:
      title: Konto entfernen?
      description: Das Konto wird samt lokalem Cache entfernt. Die Zugangsdaten werden auch aus dem Passwort-Tresor von haex-vault gelöscht.
      abort: Abbrechen
      confirm: Entfernen
en:
  title: Settings
  accounts:
    title: Mail Accounts
    empty: No accounts configured yet.
    add: Add account
    addTitle: New mail account
    edit: Edit account
    editTitle: Edit account
    delete: Remove account
    deleteConfirm:
      title: Remove account?
      description: The account and its local cache will be removed. The credentials are also deleted from the haex-vault password store.
      abort: Cancel
      confirm: Remove
</i18n>
