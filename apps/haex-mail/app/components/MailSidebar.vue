<script setup lang="ts">
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Folder,
  Pencil,
  Plus,
  Settings,
  RefreshCw,
} from "@lucide/vue";
import { toast } from "vue-sonner";
import { decodeMailboxName } from "~/lib/imap";
import { ALL_ACCOUNTS_ID, mailboxDisplayName, roleLabelKey } from "~/lib/mail";
import { getErrorMessage } from "~/lib/utils";
import type { MailboxRole } from "~/database/schemas";
import type { Ref } from "vue";

defineEmits<{ compose: []; refresh: [] }>();

const { t } = useI18n();
// mail.roles.* lives only in the global messages (plugins/i18n-messages.ts); look it
// up on the global scope so the local <i18n> block doesn't fall back and warn.
const { t: tRole } = useI18n({ useScope: "global" });
const router = useRouter();
const accountsStore = useAccountsStore();
const mailStore = useMailStore();

interface MailboxRow {
  id: string;
  name: string;
  displayName: string;
  role: string | null;
  unseen: number;
}

const ROLE_ORDER = ["inbox", "drafts", "sent", "archive", "junk", "trash"] as const;

// Route account switching through selectAccount() — a direct v-model
// write would skip its mailbox/message state wipe.
const selectedAccountModel = computed<string | null>({
  get: () => mailStore.selectedAccountId,
  set: (v) => mailStore.selectAccount(v),
});

const selectedAccountLabel = computed(() => {
  if (mailStore.selectedAccountId === ALL_ACCOUNTS_ID) return t("allAccounts");
  return (
    accountsStore.accounts.find((a) => a.id === mailStore.selectedAccountId)
      ?.email ?? null
  );
});

const sortedMailboxes = computed<MailboxRow[]>(() => {
  if (mailStore.isUnifiedView) {
    // One aggregated row per special role, unseen counts summed.
    return ROLE_ORDER.flatMap((role) => {
      const boxes = mailStore.mailboxes.filter((m) => m.role === role);
      if (boxes.length === 0) return [];
      const labelKey = roleLabelKey(role);
      return [
        {
          id: `role::${role}`,
          name: "",
          displayName: labelKey ? tRole(labelKey) : role,
          role,
          unseen: boxes.reduce((sum, m) => sum + (m.unseen ?? 0), 0),
        },
      ];
    });
  }

  const rows: MailboxRow[] = mailStore.mailboxes.map((m) => ({
    id: m.id,
    name: m.name,
    displayName: mailboxDisplayName(m.name, tRole("mail.roles.inbox")),
    role: m.role,
    unseen: m.unseen ?? 0,
  }));

  // Special-role boxes first, in defined order; everything else alphabetically.
  return rows.sort((a, b) => {
    const ai = a.role ? ROLE_ORDER.indexOf(a.role as (typeof ROLE_ORDER)[number]) : -1;
    const bi = b.role ? ROLE_ORDER.indexOf(b.role as (typeof ROLE_ORDER)[number]) : -1;
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
});

const isRowActive = (row: MailboxRow) =>
  mailStore.isUnifiedView
    ? mailStore.selectedRole === row.role
    : mailStore.selectedMailboxName === row.name;

const onRowClick = (row: MailboxRow) => {
  if (mailStore.isUnifiedView) {
    mailStore.selectRole(row.role as MailboxRole);
  } else {
    mailStore.selectMailbox(row.name);
  }
};

// --- Create, rename and delete folders ---
// Only the folders of one account are managed: the unified view lists roles, not folders.
// Folders with a role (inbox, sent, …) are the server's own and stay as they are.

const canManage = computed(() => !mailStore.isUnifiedView && !!mailStore.selectedAccountId);
const isManageable = (row: MailboxRow) => canManage.value && row.role === null;

// The row the context menu was opened on; null on the free space below the list.
const contextRow = ref<MailboxRow | null>(null);

// One menu serves the whole list: the row under the pointer decides what it offers.
const onNavContextMenu = (event: MouseEvent) => {
  const id = (event.target as HTMLElement).closest<HTMLElement>("[data-mailbox-id]")?.dataset
    .mailboxId;
  contextRow.value = sortedMailboxes.value.find((m) => m.id === id) ?? null;
};

const nameDialogOpen = ref(false);
const nameDialogMode = ref<"create" | "rename">("create");
const deleteDialogOpen = ref(false);
const targetRow = ref<MailboxRow | null>(null);
// The account the dialog was opened for: a switch meanwhile must not redirect the change.
const targetAccountId = ref<string | null>(null);
const isBusy = ref(false);

const takenNames = computed(() =>
  mailStore.mailboxes
    .filter((m) => nameDialogMode.value === "create" || m.name !== targetRow.value?.name)
    .map((m) => decodeMailboxName(m.name)),
);
const deleteMessageCount = computed(
  () => mailStore.mailboxes.find((m) => m.name === targetRow.value?.name)?.exists ?? null,
);

const openCreate = () => {
  targetAccountId.value = mailStore.selectedAccountId;
  targetRow.value = null;
  nameDialogMode.value = "create";
  nameDialogOpen.value = true;
};
const openRename = (row: MailboxRow) => {
  targetAccountId.value = mailStore.selectedAccountId;
  targetRow.value = row;
  nameDialogMode.value = "rename";
  nameDialogOpen.value = true;
};
const openDelete = (row: MailboxRow) => {
  targetAccountId.value = mailStore.selectedAccountId;
  targetRow.value = row;
  deleteDialogOpen.value = true;
};

/** Runs a change on the server, keeps the dialog open and shows the error when it fails. */
const runChangeAsync = async (change: () => Promise<void>, dialogOpen: Ref<boolean>) => {
  isBusy.value = true;
  try {
    await change();
    dialogOpen.value = false;
  } catch (err) {
    toast.error(getErrorMessage(err));
  } finally {
    isBusy.value = false;
  }
};

const submitNameAsync = (name: string) => {
  const accountId = targetAccountId.value;
  if (!accountId) return Promise.resolve();
  const row = targetRow.value;
  return runChangeAsync(async () => {
    if (nameDialogMode.value === "rename" && row) {
      await mailStore.renameMailboxAsync(accountId, row.name, name);
      toast.success(t("renamed", { name }));
    } else if (await mailStore.createMailboxAsync(accountId, name)) {
      toast.success(t("created", { name }));
    } else {
      toast.info(t("alreadyExists", { name }));
    }
  }, nameDialogOpen);
};

const confirmDeleteAsync = () => {
  const accountId = targetAccountId.value;
  const row = targetRow.value;
  if (!accountId || !row) return Promise.resolve();
  return runChangeAsync(async () => {
    await mailStore.deleteMailboxAsync(accountId, row.name);
    toast.success(t("deleted", { name: row.displayName }));
  }, deleteDialogOpen);
};

const iconForRole = (role: string | null) => {
  switch (role) {
    case "inbox":
      return Inbox;
    case "sent":
      return Send;
    case "drafts":
      return FileText;
    case "trash":
      return Trash2;
    case "junk":
      return AlertOctagon;
    case "archive":
      return Archive;
    default:
      return Folder;
  }
};
</script>

<template>
  <aside class="border-r border-border flex flex-col bg-muted/30">
    <div class="hidden md:block p-3">
      <UiButton class="w-full" size="lg" :prepend-icon="Pencil" @click="$emit('compose')">
        {{ t("compose") }}
      </UiButton>
    </div>

    <ShadcnSelect v-model="selectedAccountModel">
      <ShadcnSelectTrigger class="mx-3 mb-2 w-[calc(100%-1.5rem)]">
        <ShadcnSelectValue :placeholder="t('chooseAccount')">
          {{ selectedAccountLabel ?? t("chooseAccount") }}
        </ShadcnSelectValue>
      </ShadcnSelectTrigger>
      <ShadcnSelectContent>
        <ShadcnSelectItem :value="ALL_ACCOUNTS_ID">{{ t("allAccounts") }}</ShadcnSelectItem>
        <ShadcnSelectItem
          v-for="account in accountsStore.accounts"
          :key="account.id"
          :value="account.id"
        >
          <div class="flex flex-col items-start">
            <span>{{ account.email }}</span>
            <span
              v-if="account.displayName && account.displayName !== account.email"
              class="text-xs text-muted-foreground"
            >
              {{ account.displayName }}
            </span>
          </div>
        </ShadcnSelectItem>
      </ShadcnSelectContent>
    </ShadcnSelect>

    <ShadcnSeparator />

    <div v-if="canManage" class="flex items-center justify-between pl-4 pr-2 pt-2">
      <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {{ t("folders") }}
      </span>
      <UiButton
        variant="ghost"
        size="icon-sm"
        :icon="Plus"
        :tooltip="t('newFolder')"
        :aria-label="t('newFolder')"
        @click="openCreate"
      />
    </div>

    <ShadcnContextMenu>
      <ShadcnContextMenuTrigger as-child :disabled="!canManage">
        <nav class="flex-1 overflow-y-auto p-2 space-y-0.5" @contextmenu="onNavContextMenu">
          <button
            v-for="mb in sortedMailboxes"
            :key="mb.id"
            :data-mailbox-id="mb.id"
            class="w-full flex items-center gap-2 rounded-md px-3 py-1.5 min-h-11 md:min-h-9 text-sm hover:bg-accent text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="{
              'bg-accent font-medium': isRowActive(mb),
            }"
            @click="onRowClick(mb)"
          >
            <component :is="iconForRole(mb.role)" class="size-4 shrink-0" />
            <span class="truncate flex-1">{{ mb.displayName }}</span>
            <span
              v-if="mb.unseen > 0"
              class="text-xs tabular-nums text-muted-foreground"
            >
              {{ mb.unseen }}
            </span>
          </button>
        </nav>
      </ShadcnContextMenuTrigger>
      <ShadcnContextMenuContent>
        <ShadcnContextMenuItem @select="openCreate">{{ t("newFolder") }}</ShadcnContextMenuItem>
        <template v-if="contextRow && isManageable(contextRow)">
          <ShadcnContextMenuSeparator />
          <ShadcnContextMenuItem @select="openRename(contextRow)">
            {{ t("rename") }}
          </ShadcnContextMenuItem>
          <ShadcnContextMenuItem
            class="text-destructive focus:text-destructive"
            @select="openDelete(contextRow)"
          >
            {{ t("delete") }}
          </ShadcnContextMenuItem>
        </template>
      </ShadcnContextMenuContent>
    </ShadcnContextMenu>

    <MailboxNameDialog
      v-model:open="nameDialogOpen"
      :mode="nameDialogMode"
      :initial-name="targetRow ? decodeMailboxName(targetRow.name) : undefined"
      :taken="takenNames"
      :busy="isBusy"
      @submit="submitNameAsync"
    />
    <MailboxDeleteDialog
      v-model:open="deleteDialogOpen"
      :name="targetRow?.displayName ?? ''"
      :message-count="deleteMessageCount"
      :busy="isBusy"
      @confirm="confirmDeleteAsync"
    />

    <div class="p-2 border-t border-border space-y-0.5">
      <UiButton
        variant="ghost"
        size="lg"
        class="w-full justify-start"
        :disabled="mailStore.isLoadingMessages || mailStore.isLoadingMailboxes"
        @click="$emit('refresh')"
      >
        <RefreshCw
          class="size-4 mr-2 shrink-0"
          :class="{ 'animate-spin': mailStore.isLoadingMessages || mailStore.isLoadingMailboxes }"
        />
        {{ t("refresh") }}
      </UiButton>
      <UiButton
        variant="ghost"
        size="lg"
        class="w-full justify-start"
        @click="router.push('/settings')"
      >
        <Settings class="size-4 mr-2 shrink-0" />
        {{ t("settings") }}
      </UiButton>
    </div>
  </aside>
</template>

<i18n lang="yaml">
de:
  compose: Neue Nachricht
  chooseAccount: Konto wählen
  allAccounts: Alle Konten
  refresh: Aktualisieren
  settings: Einstellungen
  folders: Ordner
  newFolder: Neuer Ordner
  rename: Umbenennen
  delete: Löschen
  created: Ordner „{name}“ angelegt
  alreadyExists: Den Ordner „{name}“ gibt es schon
  renamed: Ordner umbenannt in „{name}“
  deleted: Ordner „{name}“ gelöscht
en:
  compose: New message
  chooseAccount: Choose account
  allAccounts: All accounts
  refresh: Refresh
  settings: Settings
  folders: Folders
  newFolder: New folder
  rename: Rename
  delete: Delete
  created: Folder “{name}” created
  alreadyExists: The folder “{name}” already exists
  renamed: Folder renamed to “{name}”
  deleted: Folder “{name}” deleted
</i18n>
