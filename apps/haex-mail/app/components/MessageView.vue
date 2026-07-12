<script setup lang="ts">
import { Download, Loader2, Reply, Trash2, X } from "lucide-vue-next";
import { toast } from "vue-sonner";
import type { AttachmentJson } from "~/database/schemas";
import { getErrorMessage } from "~/lib/utils";

const props = defineProps<{ showTitle?: boolean }>();
const emit = defineEmits<{ reply: []; replyAll: []; forward: []; delete: [] }>();

const { t } = useI18n();
const mailStore = useMailStore();
const uiStore = useUiStore();
const haexVault = useHaexVaultStore();

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

// --- Attachments: open (inline pdf/image/txt) or download ---

/** The list row backing the open message — needed to fetch bytes by uid. */
const currentRow = computed(
  () =>
    mailStore.messageList.find((m) => m.id === mailStore.selectedMessageId) ??
    null,
);

const base64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const canViewInline = (contentType: string) =>
  contentType.startsWith("image/") ||
  contentType === "application/pdf" ||
  contentType.startsWith("text/");

type ViewerState =
  | { kind: "image"; url: string; filename: string }
  | { kind: "pdf"; url: string; filename: string }
  | { kind: "text"; text: string; filename: string };

const viewer = ref<ViewerState | null>(null);
// partIndex currently being fetched (drives the per-row spinner).
const busyPart = ref<number | null>(null);

const closeViewer = () => {
  // Blob URLs (pdf) must be revoked; data URLs (image) need no cleanup.
  if (viewer.value?.kind === "pdf") URL.revokeObjectURL(viewer.value.url);
  viewer.value = null;
};

const saveAttachmentAsync = async (att: AttachmentJson, b64: string) => {
  await haexVault.client.filesystem.saveFileAsync(base64ToBytes(b64), {
    defaultPath: att.filename ?? `attachment-${att.partIndex}`,
  });
};

const openAttachmentAsync = async (att: AttachmentJson) => {
  const row = currentRow.value;
  if (!row || busyPart.value !== null) return;
  busyPart.value = att.partIndex;
  try {
    const b64 = await mailStore.fetchAttachmentBase64Async(row, att.partIndex);
    if (att.contentType.startsWith("image/")) {
      viewer.value = {
        kind: "image",
        url: `data:${att.contentType};base64,${b64}`,
        filename: att.filename ?? "",
      };
    } else if (att.contentType === "application/pdf") {
      const blob = new Blob([base64ToBytes(b64)], { type: "application/pdf" });
      viewer.value = {
        kind: "pdf",
        url: URL.createObjectURL(blob),
        filename: att.filename ?? "",
      };
    } else if (att.contentType.startsWith("text/")) {
      viewer.value = {
        kind: "text",
        text: new TextDecoder().decode(base64ToBytes(b64)),
        filename: att.filename ?? "",
      };
    } else {
      await saveAttachmentAsync(att, b64);
    }
  } catch (err) {
    toast.error(getErrorMessage(err));
  } finally {
    busyPart.value = null;
  }
};

const downloadAttachmentAsync = async (att: AttachmentJson) => {
  const row = currentRow.value;
  if (!row || busyPart.value !== null) return;
  busyPart.value = att.partIndex;
  try {
    const b64 = await mailStore.fetchAttachmentBase64Async(row, att.partIndex);
    await saveAttachmentAsync(att, b64);
  } catch (err) {
    toast.error(getErrorMessage(err));
  } finally {
    busyPart.value = null;
  }
};

// A different message unmounts the current attachments — drop any viewer.
watch(() => mailStore.selectedMessageId, closeViewer);
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
          <h1 v-if="props.showTitle !== false" class="text-xl font-semibold leading-snug">
            {{ mailStore.messageBody.envelope.subject ?? t("noSubject") }}
          </h1>
          <div class="flex items-center gap-1 shrink-0 ml-auto">
            <span class="text-xs text-muted-foreground mt-1 mr-1">
              {{ formatDate(mailStore.messageBody.envelope.internalDate) }}
            </span>
            <template v-if="props.showTitle !== false">
              <ShadcnTooltip>
                <ShadcnTooltipTrigger as-child>
                  <UiButton
                    variant="ghost"
                    size="icon-lg"
                    :icon="Reply"
                    :aria-label="t('reply')"
                    @click="emit('reply')"
                  />
                </ShadcnTooltipTrigger>
                <ShadcnTooltipContent>{{ t("reply") }}</ShadcnTooltipContent>
              </ShadcnTooltip>
              <MailMoreMenu @reply-all="emit('replyAll')" @forward="emit('forward')" />
              <ShadcnTooltip>
                <ShadcnTooltipTrigger as-child>
                  <UiButton
                    variant="ghost"
                    size="icon-lg"
                    :icon="Trash2"
                    :aria-label="t('delete')"
                    @click="emit('delete')"
                  />
                </ShadcnTooltipTrigger>
                <ShadcnTooltipContent>{{ t("delete") }}</ShadcnTooltipContent>
              </ShadcnTooltip>
            </template>
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
        <ul class="space-y-1.5 text-sm">
          <li
            v-for="att in mailStore.messageBody.attachments"
            :key="att.partIndex"
            class="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
          >
            <button
              type="button"
              class="flex-1 min-w-0 flex items-baseline gap-1.5 text-left hover:underline disabled:no-underline disabled:opacity-60"
              :disabled="busyPart !== null"
              :title="canViewInline(att.contentType) ? t('openAttachment') : t('downloadAttachment')"
              @click="openAttachmentAsync(att)"
            >
              <span class="truncate font-medium">{{ att.filename ?? t("unnamed") }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">
                {{ att.contentType }} ({{ Math.round(att.size / 1024) }} KB)
              </span>
            </button>
            <Loader2
              v-if="busyPart === att.partIndex"
              class="size-4 shrink-0 animate-spin text-muted-foreground"
            />
            <button
              v-else
              type="button"
              class="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
              :disabled="busyPart !== null"
              :aria-label="t('downloadAttachment')"
              @click="downloadAttachmentAsync(att)"
            >
              <Download class="size-4" />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Inline attachment viewer (image / pdf / text) -->
    <Transition name="fade">
      <div
        v-if="viewer"
        class="fixed inset-0 z-50 bg-background flex flex-col"
      >
        <header class="h-14 shrink-0 border-b border-border flex items-center gap-2 px-3">
          <span class="flex-1 truncate font-medium">{{ viewer.filename || t("attachment") }}</span>
          <UiButton
            variant="ghost"
            size="icon-lg"
            :icon="X"
            :aria-label="t('close')"
            @click="closeViewer"
          />
        </header>
        <div class="flex-1 min-h-0 overflow-auto grid place-items-center bg-muted/30 p-4">
          <img
            v-if="viewer.kind === 'image'"
            :src="viewer.url"
            :alt="viewer.filename"
            class="max-w-full max-h-full object-contain"
          />
          <iframe
            v-else-if="viewer.kind === 'pdf'"
            :src="viewer.url"
            class="w-full h-full border-0 bg-white"
          />
          <pre
            v-else
            class="w-full h-full self-start whitespace-pre-wrap font-mono text-sm"
          >{{ viewer.text }}</pre>
        </div>
      </div>
    </Transition>
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
  attachment: Anhang
  unnamed: (unbenannt)
  openAttachment: Anhang öffnen
  downloadAttachment: Anhang herunterladen
  close: Schließen
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
  attachment: Attachment
  unnamed: (unnamed)
  openAttachment: Open attachment
  downloadAttachment: Download attachment
  close: Close
  reply: Reply
  delete: Delete
</i18n>
