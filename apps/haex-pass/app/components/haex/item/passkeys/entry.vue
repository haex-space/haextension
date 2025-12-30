<template>
  <div
    class="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
  >
    <!-- Icon -->
    <div
      class="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"
    >
      <KeyRound class="w-5 h-5 text-primary" />
    </div>

    <!-- Info -->
    <div class="flex-1 min-w-0">
      <!-- Nickname or RP Name -->
      <div class="flex items-center gap-2">
        <span v-if="isEditingNickname" class="flex-1">
          <ShadcnInput
            ref="nicknameInputRef"
            v-model="editedNickname"
            class="h-7 text-sm"
            :placeholder="t('nickname.placeholder')"
            @keyup.enter="saveNickname"
            @keyup.escape="cancelEditNickname"
            @blur="saveNickname"
          />
        </span>
        <span
          v-else
          class="font-medium text-sm truncate cursor-pointer hover:text-primary"
          :title="t('nickname.clickToEdit')"
          @click="startEditNickname"
        >
          {{ displayName }}
        </span>
      </div>

      <!-- Details -->
      <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
        <span class="truncate">{{ passkey.relyingPartyId }}</span>
        <span v-if="passkey.userName" class="truncate">
          &middot; {{ passkey.userName }}
        </span>
      </div>

      <!-- Metadata -->
      <div class="flex items-center gap-3 text-xs text-muted-foreground mt-1">
        <span v-if="passkey.createdAt" class="flex items-center gap-1">
          <Calendar class="w-3 h-3" />
          {{ formatDate(passkey.createdAt) }}
        </span>
        <span v-if="passkey.lastUsedAt" class="flex items-center gap-1">
          <Clock class="w-3 h-3" />
          {{ formatRelativeTime(passkey.lastUsedAt) }}
        </span>
        <span
          v-if="passkey.isDiscoverable"
          class="flex items-center gap-1 text-primary"
        >
          <Fingerprint class="w-3 h-3" />
          {{ t("discoverable") }}
        </span>
      </div>
    </div>

    <!-- Actions -->
    <div v-if="!readOnly" class="flex-shrink-0 flex items-center gap-1">
      <UiButton
        :icon="Trash2"
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive hover:bg-destructive/10"
        :title="t('delete')"
        @click="showDeleteDialog = true"
      />
    </div>

    <!-- Delete Confirmation Dialog -->
    <ShadcnAlertDialog v-model:open="showDeleteDialog">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>
            {{ t("deleteDialog.title") }}
          </ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{ t("deleteDialog.description", { name: displayName }) }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>
            {{ t("deleteDialog.cancel") }}
          </ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="onDelete"
          >
            {{ t("deleteDialog.confirm") }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<script setup lang="ts">
import {
  KeyRound,
  Trash2,
  Calendar,
  Clock,
  Fingerprint,
} from "lucide-vue-next";
import type { SelectHaexPasswordsPasskeys } from "~/database";

const props = defineProps<{
  passkey: SelectHaexPasswordsPasskeys;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  delete: [passkeyId: string];
  updateNickname: [passkeyId: string, nickname: string];
}>();

const { t, locale } = useI18n();

const showDeleteDialog = ref(false);
const isEditingNickname = ref(false);
const editedNickname = ref("");
const nicknameInputRef = useTemplateRef<HTMLInputElement>("nicknameInputRef");

const displayName = computed(() => {
  return (
    props.passkey.nickname ||
    props.passkey.relyingPartyName ||
    props.passkey.relyingPartyId
  );
});

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale.value, { dateStyle: "medium" });
};

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return t("time.today");
  } else if (diffDays === 1) {
    return t("time.yesterday");
  } else if (diffDays < 7) {
    return t("time.daysAgo", { days: diffDays });
  } else {
    return formatDate(dateString);
  }
};

const startEditNickname = () => {
  if (props.readOnly) return;
  editedNickname.value = props.passkey.nickname || "";
  isEditingNickname.value = true;
  nextTick(() => {
    nicknameInputRef.value?.focus();
  });
};

const saveNickname = () => {
  if (editedNickname.value !== props.passkey.nickname) {
    emit("updateNickname", props.passkey.id, editedNickname.value);
  }
  isEditingNickname.value = false;
};

const cancelEditNickname = () => {
  isEditingNickname.value = false;
  editedNickname.value = "";
};

const onDelete = () => {
  emit("delete", props.passkey.id);
  showDeleteDialog.value = false;
};
</script>

<i18n lang="yaml">
de:
  discoverable: Auffindbar
  delete: Passkey löschen
  nickname:
    placeholder: Nickname eingeben...
    clickToEdit: Klicken zum Bearbeiten
  time:
    today: Heute
    yesterday: Gestern
    daysAgo: Vor {days} Tagen
  deleteDialog:
    title: Passkey löschen?
    description: Der Passkey "{name}" wird unwiderruflich gelöscht. Du kannst dich danach nicht mehr mit diesem Passkey auf der Website anmelden.
    cancel: Abbrechen
    confirm: Löschen

en:
  discoverable: Discoverable
  delete: Delete passkey
  nickname:
    placeholder: Enter nickname...
    clickToEdit: Click to edit
  time:
    today: Today
    yesterday: Yesterday
    daysAgo: "{days} days ago"
  deleteDialog:
    title: Delete passkey?
    description: The passkey "{name}" will be permanently deleted. You won't be able to sign in with this passkey on the website anymore.
    cancel: Cancel
    confirm: Delete
</i18n>
