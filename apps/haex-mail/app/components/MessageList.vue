<script setup lang="ts">
import type { SelectMessage } from "~/database/schemas";

const mailStore = useMailStore();

const formatSender = (msg: SelectMessage) => {
  const first = msg.fromJson[0];
  if (!first) return "(unbekannt)";
  return first.name ?? first.email;
};

const formatDate = (ts: number | null) => {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  // Within current year: short month + day; older: full date.
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString();
};

const isUnread = (msg: SelectMessage) => {
  // IMAP delivers \Seen as a flag; absence means unread.
  return !msg.flags.some((f) => f.toLowerCase().includes("seen"));
};
</script>

<template>
  <section class="border-r border-border flex flex-col">
    <header class="h-12 border-b border-border flex items-center px-4 text-sm font-medium">
      {{ mailStore.selectedMailboxName ?? "Kein Postfach gewählt" }}
      <span v-if="mailStore.isLoadingMessages" class="ml-2 text-muted-foreground">…</span>
    </header>

    <ul v-if="mailStore.messageList.length > 0" class="flex-1 overflow-y-auto">
      <li
        v-for="msg in mailStore.messageList"
        :key="msg.id"
        class="border-b border-border px-4 py-3 cursor-pointer hover:bg-accent/50"
        :class="{
          'bg-accent': mailStore.selectedMessageUid === msg.uid,
          'font-semibold': isUnread(msg),
        }"
        @click="mailStore.selectMessage(msg.uid)"
      >
        <div class="flex items-baseline gap-2">
          <span class="truncate text-sm flex-1">{{ formatSender(msg) }}</span>
          <span class="text-xs text-muted-foreground tabular-nums shrink-0">
            {{ formatDate(msg.internalDate) }}
          </span>
        </div>
        <div class="text-sm truncate mt-0.5">
          {{ msg.subject ?? "(kein Betreff)" }}
        </div>
      </li>
    </ul>

    <div v-else class="flex-1 grid place-items-center text-sm text-muted-foreground">
      <p v-if="mailStore.isLoadingMessages">Lade Nachrichten…</p>
      <p v-else>Keine Nachrichten.</p>
    </div>
  </section>
</template>
