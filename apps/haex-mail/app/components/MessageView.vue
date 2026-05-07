<script setup lang="ts">
const mailStore = useMailStore();

const formatAddresses = (
  addrs: { name?: string; email: string }[] | undefined,
) => {
  if (!addrs?.length) return "";
  return addrs.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");
};

const formatDate = (ts: number | undefined) => {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
};
</script>

<template>
  <article class="overflow-y-auto">
    <div
      v-if="!mailStore.messageBody && !mailStore.isLoadingMessage"
      class="h-full grid place-items-center text-sm text-muted-foreground"
    >
      <p>Wähle eine Nachricht.</p>
    </div>

    <div
      v-else-if="mailStore.isLoadingMessage"
      class="h-full grid place-items-center text-sm text-muted-foreground"
    >
      <p>Lade Nachricht…</p>
    </div>

    <div v-else-if="mailStore.messageBody" class="p-6 max-w-4xl mx-auto">
      <header class="space-y-1 pb-4 border-b border-border">
        <h1 class="text-xl font-semibold">
          {{ mailStore.messageBody.envelope.subject ?? "(kein Betreff)" }}
        </h1>
        <div class="text-sm text-muted-foreground">
          <strong class="text-foreground">Von:</strong>
          {{ formatAddresses(mailStore.messageBody.envelope.from) }}
        </div>
        <div class="text-sm text-muted-foreground">
          <strong class="text-foreground">An:</strong>
          {{ formatAddresses(mailStore.messageBody.envelope.to) }}
        </div>
        <div
          v-if="mailStore.messageBody.envelope.cc?.length"
          class="text-sm text-muted-foreground"
        >
          <strong class="text-foreground">Cc:</strong>
          {{ formatAddresses(mailStore.messageBody.envelope.cc) }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{ formatDate(mailStore.messageBody.envelope.internalDate) }}
        </div>
      </header>

      <!-- HTML content runs inside an iframe with sandbox flags so
           remote scripts and tracking pixels don't execute against
           the extension origin. The vault still proxied the raw bytes
           via IMAP — we don't fetch arbitrary remote URLs here. -->
      <iframe
        v-if="mailStore.messageBody.bodyHtml"
        :srcdoc="mailStore.messageBody.bodyHtml"
        sandbox=""
        class="w-full h-[60vh] mt-4 border border-border rounded"
      />
      <pre
        v-else
        class="whitespace-pre-wrap font-sans text-sm mt-4"
      >{{ mailStore.messageBody.bodyText ?? "(leer)" }}</pre>

      <div
        v-if="mailStore.messageBody.attachments.length > 0"
        class="mt-6 pt-4 border-t border-border"
      >
        <h2 class="text-sm font-medium mb-2">
          Anhänge ({{ mailStore.messageBody.attachments.length }})
        </h2>
        <ul class="space-y-1 text-sm">
          <li
            v-for="att in mailStore.messageBody.attachments"
            :key="att.partIndex"
            class="text-muted-foreground"
          >
            {{ att.filename ?? "(unbenannt)" }} —
            {{ att.contentType }} ({{ Math.round(att.size / 1024) }} KB)
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>
