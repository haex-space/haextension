<script setup lang="ts">
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-vue-next";
import { SORT_OPTIONS } from "~/stores/mail";

/**
 * Sort dropdown for the message list — used in the desktop list header
 * (MessageList) and the mobile page header (index.vue). State and
 * toggle logic live in the mail store.
 */
const { t } = useI18n();
const mailStore = useMailStore();
</script>

<template>
  <ShadcnDropdownMenu>
    <ShadcnDropdownMenuTrigger as-child>
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="ArrowUpDown"
        :aria-label="t('sort')"
      />
    </ShadcnDropdownMenuTrigger>
    <ShadcnDropdownMenuContent align="end" class="w-44">
      <ShadcnDropdownMenuItem
        v-for="opt in SORT_OPTIONS"
        :key="opt.field"
        class="justify-between"
        @click.prevent="mailStore.toggleSort(opt.field)"
      >
        <span>{{ t(opt.labelKey) }}</span>
        <ChevronUp
          v-if="mailStore.sortField === opt.field && mailStore.sortDir === 'asc'"
          class="h-3.5 w-3.5 text-muted-foreground"
        />
        <ChevronDown
          v-else-if="mailStore.sortField === opt.field && mailStore.sortDir === 'desc'"
          class="h-3.5 w-3.5 text-muted-foreground"
        />
      </ShadcnDropdownMenuItem>
    </ShadcnDropdownMenuContent>
  </ShadcnDropdownMenu>
</template>

<i18n lang="yaml">
de:
  sort: Sortieren
  sortDate: Datum
  sortSubject: Betreff
  sortSender: Absender
  sortFlagged: Wichtigkeit
  sortRead: Gelesen/Ungelesen
en:
  sort: Sort
  sortDate: Date
  sortSubject: Subject
  sortSender: Sender
  sortFlagged: Importance
  sortRead: Read/Unread
</i18n>
