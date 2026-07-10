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
  Settings,
} from "lucide-vue-next";
import { ALL_ACCOUNTS_ID, roleLabelKey } from "~/stores/mail";
import type { MailboxRole } from "~/database/schemas";

defineEmits<{ compose: [] }>();

const { t } = useI18n();
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
          displayName: labelKey ? t(labelKey) : role,
          role,
          unseen: boxes.reduce((sum, m) => sum + (m.unseen ?? 0), 0),
        },
      ];
    });
  }

  const rows: MailboxRow[] = mailStore.mailboxes.map((m) => ({
    id: m.id,
    name: m.name,
    displayName: m.name === "INBOX" ? t("mail.roles.inbox") : m.name,
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
    return a.name.localeCompare(b.name);
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
    <div class="p-3">
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

    <Separator />

    <nav class="flex-1 overflow-y-auto p-2 space-y-0.5">
      <button
        v-for="mb in sortedMailboxes"
        :key="mb.id"
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

    <div class="p-2 border-t border-border">
      <UiButton
        variant="ghost"
        size="lg"
        class="w-full justify-start"
        :prepend-icon="Settings"
        @click="router.push('/settings')"
      >
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
  settings: Einstellungen
en:
  compose: New message
  chooseAccount: Choose account
  allAccounts: All accounts
  settings: Settings
</i18n>
