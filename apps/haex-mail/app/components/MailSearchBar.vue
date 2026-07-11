<script setup lang="ts">
import { X } from "lucide-vue-next";

/**
 * Inline search input (close + query + clear) for the message list —
 * rendered while `mailStore.isSearching` in the desktop list header
 * (MessageList) and the mobile page header (index.vue). Autofocuses on
 * mount, i.e. when search is opened.
 */
const { t } = useI18n();
const mailStore = useMailStore();

const inputRef = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  await nextTick();
  inputRef.value?.focus();
});

const close = () => {
  mailStore.isSearching = false;
  mailStore.searchQuery = "";
};
</script>

<template>
  <UiButton
    variant="ghost"
    size="icon-lg"
    :icon="X"
    :aria-label="t('closeSearch')"
    @click="close"
  />
  <input
    ref="inputRef"
    v-model="mailStore.searchQuery"
    type="search"
    class="flex-1 h-8 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
    :placeholder="t('searchPlaceholder')"
  >
  <UiButton
    v-if="mailStore.searchQuery"
    variant="ghost"
    size="icon-lg"
    :icon="X"
    :aria-label="t('clearSearch')"
    @click="mailStore.searchQuery = ''"
  />
</template>

<i18n lang="yaml">
de:
  closeSearch: Suche schließen
  clearSearch: Eingabe löschen
  searchPlaceholder: Nachrichten durchsuchen…
en:
  closeSearch: Close search
  clearSearch: Clear input
  searchPlaceholder: Search messages…
</i18n>
