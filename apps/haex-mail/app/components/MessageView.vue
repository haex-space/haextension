<script setup lang="ts">
import { Reply, Trash2 } from "lucide-vue-next";

const emit = defineEmits<{ reply: []; delete: [] }>();

const { t } = useI18n();
const mailStore = useMailStore();
const uiStore = useUiStore();

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
      <p>{{ t("selectPrompt") }}</p>
    </div>

    <div
      v-else-if="mailStore.isLoadingMessage"
      class="h-full grid place-items-center text-sm text-muted-foreground"
    >
      <p>{{ t("loading") }}</p>
    </div>

    <div v-else-if="mailStore.messageBody" class="p-6 max-w-4xl mx-auto">
      <header class="pb-4 border-b border-border space-y-3">
        <div class="flex items-start justify-between gap-4">
          <h1 class="text-xl font-semibold leading-snug">
            {{ mailStore.messageBody.envelope.subject ?? t("noSubject") }}
          </h1>
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-xs text-muted-foreground mt-1 mr-1">
              {{ formatDate(mailStore.messageBody.envelope.internalDate) }}
            </span>
            <UiButton
              variant="ghost"
              size="icon-lg"
              :icon="Reply"
              :aria-label="t('reply')"
              @click="emit('reply')"
            />
            <UiButton
              variant="ghost"
              size="icon-lg"
              :icon="Trash2"
              :aria-label="t('delete')"
              @click="emit('delete')"
            />
          </div>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-muted-foreground">{{ t("from") }}</dt>
          <dd>{{ formatAddresses(mailStore.messageBody.envelope.from) }}</dd>
          <dt class="text-muted-foreground">{{ t("to") }}</dt>
          <dd>{{ formatAddresses(mailStore.messageBody.envelope.to) }}</dd>
          <template v-if="mailStore.messageBody.envelope.cc?.length">
            <dt class="text-muted-foreground">Cc</dt>
            <dd>{{ formatAddresses(mailStore.messageBody.envelope.cc) }}</dd>
          </template>
        </dl>
      </header>

      <!-- HTML content runs inside an iframe with sandbox flags so
           remote scripts and tracking pixels don't execute against
           the extension origin. The vault still proxied the raw bytes
           via IMAP — we don't fetch arbitrary remote URLs here. -->
      <iframe
        v-if="uiStore.mailFormat === 'html' && mailStore.messageBody.bodyHtml"
        :srcdoc="mailStore.messageBody.bodyHtml"
        sandbox=""
        class="w-full h-[60vh] mt-4 border border-border rounded"
      />
      <pre
        v-else
        class="whitespace-pre-wrap font-sans text-sm mt-4"
      >{{ mailStore.messageBody.bodyText ?? t("emptyBody") }}</pre>

      <div
        v-if="mailStore.messageBody.attachments.length > 0"
        class="mt-6 pt-4 border-t border-border"
      >
        <h2 class="text-sm font-medium mb-2">
          {{ t("attachments", { count: mailStore.messageBody.attachments.length }) }}
        </h2>
        <ul class="space-y-1 text-sm">
          <li
            v-for="att in mailStore.messageBody.attachments"
            :key="att.partIndex"
            class="text-muted-foreground"
          >
            {{ att.filename ?? t("unnamed") }} —
            {{ att.contentType }} ({{ Math.round(att.size / 1024) }} KB)
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>

<i18n lang="yaml">
de:
  selectPrompt: Wähle eine Nachricht.
  loading: Lade Nachricht…
  noSubject: (kein Betreff)
  from: Von
  to: An
  emptyBody: (leer)
  attachments: "Anhänge ({count})"
  unnamed: (unbenannt)
  reply: Antworten
  delete: Löschen
en:
  selectPrompt: Select a message.
  loading: Loading message…
  noSubject: (no subject)
  from: From
  to: To
  emptyBody: (empty)
  attachments: "Attachments ({count})"
  unnamed: (unnamed)
  reply: Reply
  delete: Delete
</i18n>
