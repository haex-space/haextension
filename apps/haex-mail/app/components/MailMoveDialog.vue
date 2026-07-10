<script setup lang="ts">
import { eq } from "drizzle-orm";
import { Folder } from "lucide-vue-next";
import * as schema from "~/database/schemas";

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  /** Account whose folders are offered as move targets. */
  accountId: string;
  /** Source mailbox — excluded from the target list. */
  excludeMailboxName?: string;
}>();

const emit = defineEmits<{ select: [mailboxName: string] }>();

const haexVault = useHaexVaultStore();
const folders = ref<schema.SelectMailbox[]>([]);

watch(open, async (v) => {
  if (!v || !haexVault.orm) return;
  const rows = await haexVault.orm
    .select()
    .from(schema.mailboxes)
    .where(eq(schema.mailboxes.accountId, props.accountId));
  folders.value = rows
    .filter((m) => m.name !== props.excludeMailboxName)
    .sort((a, b) => a.name.localeCompare(b.name));
});

const onSelect = (mailboxName: string) => {
  open.value = false;
  emit("select", mailboxName);
};
</script>

<template>
  <UiDrawerModal v-model:open="open" title="In Ordner verschieben">
    <template #content>
      <div class="p-4 space-y-0.5 max-h-[60vh] overflow-y-auto">
        <UiButton
          v-for="folder in folders"
          :key="folder.id"
          variant="ghost"
          size="lg"
          class="w-full justify-start"
          :prepend-icon="Folder"
          @click="onSelect(folder.name)"
        >
          <span class="truncate">
            {{ folder.name === "INBOX" ? "Posteingang" : folder.name }}
          </span>
        </UiButton>
        <p v-if="folders.length === 0" class="text-sm text-muted-foreground">
          Keine weiteren Ordner vorhanden.
        </p>
      </div>
    </template>
  </UiDrawerModal>
</template>
