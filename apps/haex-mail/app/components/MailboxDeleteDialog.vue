<script setup lang="ts">
/**
 * Confirms deleting a folder. IMAP removes the messages in it with it, so the text says how many
 * there are; the caller deletes and shows a server error (`busy` holds the dialog meanwhile).
 */
const open = defineModel<boolean>("open", { default: false });

defineProps<{
  /** The folder's name as the user knows it. */
  name: string;
  /** Messages in the folder, when known. */
  messageCount?: number | null;
  busy?: boolean;
}>();

const emit = defineEmits<{ confirm: [] }>();

const { t } = useI18n();
</script>

<template>
  <UiDrawerModal v-model:open="open" :title="t('title', { name })" :dismissible="!busy">
    <template #content>
      <div class="py-2 space-y-2 text-sm">
        <p>
          {{ messageCount ? t("withMessages", { count: messageCount }) : t("empty") }}
        </p>
        <p class="text-muted-foreground">{{ t("permanent") }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UiButton variant="ghost" size="lg" :disabled="busy" @click="open = false">
          {{ t("cancel") }}
        </UiButton>
        <UiButton variant="destructive" size="lg" :loading="busy" @click="emit('confirm')">
          {{ t("confirm") }}
        </UiButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<i18n lang="yaml">
de:
  title: Ordner „{name}“ löschen?
  empty: Der Ordner wird gelöscht.
  withMessages: "Der Ordner und die {count} Nachrichten darin werden gelöscht."
  permanent: Das lässt sich nicht rückgängig machen. Unterordner sind je nach Mailserver mit betroffen.
  cancel: Abbrechen
  confirm: Löschen
en:
  title: Delete folder “{name}”?
  empty: The folder will be deleted.
  withMessages: "The folder and the {count} messages in it will be deleted."
  permanent: This cannot be undone. Subfolders may be affected, depending on the mail server.
  cancel: Cancel
  confirm: Delete
</i18n>
