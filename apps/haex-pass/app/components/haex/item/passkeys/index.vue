<template>
  <div class="space-y-4">
    <!-- Empty State -->
    <div
      v-if="passkeys.length === 0"
      class="text-center text-muted-foreground py-8"
    >
      {{ t("passkeys.empty") }}
    </div>

    <!-- Passkey List -->
    <div v-else class="space-y-2">
      <HaexItemPasskeysEntry
        v-for="passkey in passkeys"
        :key="passkey.id"
        :passkey="passkey"
        :read-only="readOnly"
        @delete="onDeletePasskey"
        @update-nickname="onUpdateNickname"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import type { SelectHaexPasswordsPasskeys } from "~/database";

defineProps<{
  readOnly?: boolean;
}>();

const { t } = useI18n();
const passkeyStore = usePasskeyStore();

const itemId = defineModel<string>("itemId");

// Temporary passkeys for new items (before item is saved)
const passkeysToAdd = defineModel<SelectHaexPasswordsPasskeys[]>("passkeysToAdd", {
  default: [],
});

// Passkeys to delete (tracked for batch deletion on save)
const passkeysToDelete = defineModel<SelectHaexPasswordsPasskeys[]>("passkeysToDelete", {
  default: [],
});

// Passkeys für dieses Item (aus der Datenbank)
const savedPasskeys = ref<SelectHaexPasswordsPasskeys[]>([]);

// Kombinierte Liste: gespeicherte (minus zu löschende) + temporäre Passkeys
const passkeys = computed(() => {
  const deleteIds = new Set(passkeysToDelete.value?.map(p => p.id) || []);
  const filteredSaved = savedPasskeys.value.filter(p => !deleteIds.has(p.id));
  return [
    ...filteredSaved,
    ...(passkeysToAdd.value || []),
  ];
});

// Passkeys laden wenn sich die itemId ändert
watch(
  () => itemId.value,
  async (newItemId) => {
    if (newItemId) {
      savedPasskeys.value = await passkeyStore.getPasskeysByItemIdAsync(newItemId);
    } else {
      savedPasskeys.value = [];
    }
  },
  { immediate: true }
);

const onDeletePasskey = (passkeyId: string) => {
  // Check if it's a temporary passkey
  const tempIndex = passkeysToAdd.value?.findIndex(p => p.id === passkeyId) ?? -1;
  if (tempIndex >= 0) {
    passkeysToAdd.value?.splice(tempIndex, 1);
    return;
  }

  // Track for deletion on save (don't delete immediately)
  const passkey = savedPasskeys.value.find(p => p.id === passkeyId);
  if (passkey && passkeysToDelete.value) {
    passkeysToDelete.value.push(passkey);
  }
};

const onUpdateNickname = async (passkeyId: string, nickname: string) => {
  // Check if it's a temporary passkey
  const tempPasskey = passkeysToAdd.value?.find(p => p.id === passkeyId);
  if (tempPasskey) {
    tempPasskey.nickname = nickname;
    return;
  }

  // Update in database
  await passkeyStore.updatePasskeyAsync(passkeyId, { nickname });
  if (itemId.value) {
    savedPasskeys.value = await passkeyStore.getPasskeysByItemIdAsync(itemId.value);
  }
};

</script>

<i18n lang="yaml">
de:
  passkeys:
    empty: Keine Passkeys vorhanden

en:
  passkeys:
    empty: No passkeys available
</i18n>
