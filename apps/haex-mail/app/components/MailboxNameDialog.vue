<script setup lang="ts">
import { checkMailboxName } from "~/lib/mailboxName";

/**
 * Asks for the name of a new folder, or the new name of an existing one. The name is shown and
 * typed as the user knows it; the caller encodes it for the server. A server error is the caller's
 * to show; it keeps the dialog open (`busy` holds it while the server works).
 */
const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  mode: "create" | "rename";
  /** The folder's current name when renaming. */
  initialName?: string;
  /** Names of the folders that exist, except the one being renamed. */
  taken: string[];
  busy?: boolean;
}>();

const emit = defineEmits<{ submit: [name: string] }>();

const { t } = useI18n();

const name = ref("");
watch(open, (isOpen) => {
  if (isOpen) name.value = props.initialName ?? "";
});

const issue = computed(() => checkMailboxName(name.value, props.taken));
// An empty field is no error to scold: the button stays off until something is typed.
const errorText = computed(() =>
  issue.value && issue.value !== "empty" ? t(`error.${issue.value}`) : undefined,
);
const canSubmit = computed(
  () => !issue.value && !props.busy && name.value.trim() !== props.initialName,
);

const submit = () => {
  if (canSubmit.value) emit("submit", name.value.trim());
};
</script>

<template>
  <UiDrawerModal
    v-model:open="open"
    :title="t(mode === 'create' ? 'createTitle' : 'renameTitle')"
    :dismissible="!busy"
  >
    <template #content>
      <form class="py-2" @submit.prevent="submit">
        <UiInput
          v-model="name"
          :label="t('name')"
          :error="errorText"
          autofocus
          autocomplete="off"
          maxlength="200"
        />
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UiButton variant="ghost" size="lg" :disabled="busy" @click="open = false">
          {{ t("cancel") }}
        </UiButton>
        <UiButton size="lg" :loading="busy" :disabled="!canSubmit" @click="submit">
          {{ t(mode === "create" ? "create" : "rename") }}
        </UiButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<i18n lang="yaml">
de:
  createTitle: Neuer Ordner
  renameTitle: Ordner umbenennen
  name: Name
  create: Anlegen
  rename: Umbenennen
  cancel: Abbrechen
  error:
    invalidChars: Der Name darf kein * oder % und keine Steuerzeichen enthalten.
    exists: Einen Ordner mit diesem Namen gibt es schon.
en:
  createTitle: New folder
  renameTitle: Rename folder
  name: Name
  create: Create
  rename: Rename
  cancel: Cancel
  error:
    invalidChars: The name must not contain * or % or control characters.
    exists: A folder with this name already exists.
</i18n>
