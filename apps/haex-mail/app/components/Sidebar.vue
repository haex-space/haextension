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
} from "lucide-vue-next";

defineEmits<{ compose: [] }>();

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

const sortedMailboxes = computed<MailboxRow[]>(() => {
  const rows: MailboxRow[] = mailStore.mailboxes.map((m) => ({
    id: m.id,
    name: m.name,
    displayName: m.name === "INBOX" ? "Posteingang" : m.name,
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
      <UiButtonclass="w-full" :prepend-icon="Pencil" @click="$emit('compose')">
        Neue Nachricht
      </UiButton>
    </div>

    <select
      v-model="mailStore.selectedAccountId"
      class="mx-3 mb-2 h-9 rounded-md border border-input bg-transparent px-3 text-sm"
    >
      <option
        v-for="account in accountsStore.accounts"
        :key="account.id"
        :value="account.id"
      >
        {{ account.displayName }}
      </option>
    </select>

    <Separator />

    <nav class="flex-1 overflow-y-auto p-2 space-y-0.5">
      <button
        v-for="mb in sortedMailboxes"
        :key="mb.id"
        class="w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent text-left"
        :class="{
          'bg-accent font-medium': mailStore.selectedMailboxName === mb.name,
        }"
        @click="mailStore.selectMailbox(mb.name)"
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
  </aside>
</template>
