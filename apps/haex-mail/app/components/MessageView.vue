<script setup lang="ts">
import { ChevronRight, Download, Loader2, Reply, Trash2 } from "lucide-vue-next";
import { toast } from "vue-sonner";
import type { AttachmentJson } from "~/database/schemas";
import { getAvatarColor, getAvatarInitials } from "~/lib/avatar";
import { getErrorMessage } from "~/lib/utils";
import {
  htmlToText,
  inlineExternalHtml,
  linkifyText,
  stripExternalHtml,
} from "~/lib/mailHtml";

// Vue casts an absent optional boolean prop to `false` unless a default is
// given, so without this the desktop 3-column view (which passes no
// show-actions attribute at all) would also suppress its own header.
const props = withDefaults(defineProps<{ showActions?: boolean }>(), {
  showActions: true,
});
const emit = defineEmits<{ reply: []; replyAll: []; forward: []; delete: [] }>();

const { t, locale } = useI18n();
const mailStore = useMailStore();
const uiStore = useUiStore();
const haexVault = useHaexVaultStore();

const formatAddresses = (
  addrs: { name?: string; email: string }[] | undefined,
) => {
  if (!addrs?.length) return "";
  return addrs.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");
};

const formatDateLine = (ts: number | undefined) => {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString(locale.value, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatTimeLine = (ts: number | undefined) => {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString(locale.value, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const primarySender = computed(() => mailStore.messageBody?.envelope.from?.[0]);

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

// Many servers label attachments as a generic octet-stream and leave the
// real type implicit in the filename extension. Recover it so PDFs/images
// show a meaningful type and can be viewed inline instead of only saved.
const GENERIC_TYPES = new Set(["application/octet-stream", "binary/octet-stream", ""]);
const EXT_TO_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  txt: "text/plain",
  log: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
};
const effectiveType = (att: AttachmentJson) => {
  if (!GENERIC_TYPES.has(att.contentType.toLowerCase())) return att.contentType;
  const ext = att.filename?.split(".").pop()?.toLowerCase();
  return (ext && EXT_TO_TYPE[ext]) || att.contentType;
};

// image and text render inline; pdf and everything else are handed to the
// host to open with the system's default app (the sandboxed webview can't
// embed them).
type ViewerState =
  | { kind: "image"; url: string; filename: string }
  | { kind: "text"; text: string; filename: string };

const viewer = ref<ViewerState | null>(null);
// partIndex currently being fetched (drives the per-row spinner).
const busyPart = ref<number | null>(null);
// Bumped whenever a viewer is closed/invalidated; an in-flight open request
// that resolves after its token is stale is discarded so it can't assign a
// viewer after cleanup.
let viewSeq = 0;

const closeViewer = () => {
  viewSeq++;
  viewer.value = null;
};

// --- Body rendering ---

const openUrlAsync = async (url: string) => {
  try {
    await haexVault.client.web.openAsync(url);
  } catch (err) {
    toast.error(getErrorMessage(err));
  }
};

// The HTML iframe's bridge script posts link clicks and its content height
// here (it can't open a browser itself — nested sandbox). Only act on
// messages from our own frame.
const mailFrame = useTemplateRef<HTMLIFrameElement>("mailFrame");
// The iframe is sized to its own content (rather than a fixed viewport
// height) so the mail body scrolls together with the rest of the message
// view instead of in its own independent scrollbox.
const iframeHeight = ref<number | null>(null);
// Clamp so a malicious message can't force scrollHeight to an enormous value
// and blow up the layout; the iframe falls back to its own scrollbar past this.
const MAX_IFRAME_HEIGHT = 20000;
const onFrameMessage = (event: MessageEvent) => {
  if (!mailFrame.value || event.source !== mailFrame.value.contentWindow) return;
  const data = event.data as {
    haexMailOpenUrl?: unknown;
    haexMailContentHeight?: unknown;
    haexMailKeydown?: unknown;
  };
  if (typeof data?.haexMailOpenUrl === "string") openUrlAsync(data.haexMailOpenUrl);
  if (typeof data?.haexMailContentHeight === "number") {
    iframeHeight.value = Math.min(data.haexMailContentHeight, MAX_IFRAME_HEIGHT);
  }
  // Focus inside the iframe means keydown never reaches the host window, so
  // the page-level Delete shortcut can't see it — invoke the same "delete
  // open message" action the parent already wires to the trash button.
  if (data?.haexMailKeydown === "Delete") emit("delete");
};
onMounted(() => window.addEventListener("message", onFrameMessage));
onBeforeUnmount(() => window.removeEventListener("message", onFrameMessage));

// Text view: prefer the sender's text/plain part; fall back to a
// link-preserving rendering of the HTML so URLs aren't lost. Bare URLs are
// then made clickable.
const textParts = computed(() => {
  const body = mailStore.messageBody;
  if (!body) return [];
  const raw = body.bodyText?.trim()
    ? body.bodyText
    : body.bodyHtml
      ? htmlToText(body.bodyHtml)
      : "";
  return linkifyText(raw || t("emptyBody"));
});

// HTML view: external resources are stripped by default (blocked by the vault
// CSP anyway) and can be loaded on demand through the host.
const remoteApproved = ref(false);
const inlinedHtml = ref<string | null>(null);
const isLoadingRemote = ref(false);

const strippedHtml = computed(() => {
  const html = mailStore.messageBody?.bodyHtml;
  return html ? stripExternalHtml(html) : { html: "", hasExternal: false };
});

const iframeSrcdoc = computed(() =>
  remoteApproved.value && inlinedHtml.value != null
    ? inlinedHtml.value
    : strippedHtml.value.html,
);

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadExternalAsync = async () => {
  const html = mailStore.messageBody?.bodyHtml;
  const messageId = mailStore.selectedMessageId;
  if (!html || isLoadingRemote.value) return;
  isLoadingRemote.value = true;
  try {
    const inlined = await inlineExternalHtml(html, async (url) =>
      blobToDataUrl(await haexVault.client.web.fetchBlobAsync(url)),
    );
    // The message switched mid-fetch — discard so the old body's approved
    // external content can't bleed into the newly selected message.
    if (mailStore.selectedMessageId !== messageId) return;
    inlinedHtml.value = inlined;
    remoteApproved.value = true;
  } catch (err) {
    toast.error(getErrorMessage(err));
  } finally {
    isLoadingRemote.value = false;
  }
};

const saveAttachmentAsync = async (att: AttachmentJson, b64: string) => {
  await haexVault.client.filesystem.saveFileAsync(base64ToBytes(b64), {
    defaultPath: att.filename ?? `attachment-${att.partIndex}`,
  });
};

const openAttachmentAsync = async (att: AttachmentJson) => {
  const row = currentRow.value;
  if (!row || busyPart.value !== null) return;
  const seq = ++viewSeq;
  busyPart.value = att.partIndex;
  try {
    const b64 = await mailStore.fetchAttachmentBase64Async(row, att.partIndex);
    // The message changed or the component unmounted while fetching — drop
    // this result rather than opening a stale viewer.
    if (seq !== viewSeq) return;
    const type = effectiveType(att);
    if (type.startsWith("image/")) {
      viewer.value = {
        kind: "image",
        url: `data:${type};base64,${b64}`,
        filename: att.filename ?? "",
      };
    } else if (type.startsWith("text/")) {
      viewer.value = {
        kind: "text",
        text: new TextDecoder().decode(base64ToBytes(b64)),
        filename: att.filename ?? "",
      };
    } else {
      // pdf and everything else: let the host open it with the system's
      // default application — the sandboxed webview can't embed it.
      await haexVault.client.filesystem.openFileAsync(base64ToBytes(b64), {
        fileName: att.filename ?? `attachment-${att.partIndex}`,
        mimeType: type,
      });
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

// Dialog open-state binding: the primitive drives close via Escape,
// outside-click and its built-in close button — all route through here.
const onViewerOpenChange = (open: boolean) => {
  if (!open) closeViewer();
};

// A different message unmounts the current attachments — drop any viewer and
// reset the per-message "load external content" approval.
watch(() => mailStore.selectedMessageId, () => {
  closeViewer();
  remoteApproved.value = false;
  inlinedHtml.value = null;
  // Clear a stale in-flight load so the new message's banner isn't stuck in
  // the loading state (its result is discarded by the id guard anyway).
  isLoadingRemote.value = false;
  // The old message's reported height would otherwise flash briefly before
  // the new iframe's own report arrives.
  iframeHeight.value = null;
});
// Unmounting (route change, fullscreen overlay teardown) must still invalidate
// any in-flight open so it can't assign a viewer after teardown — the watcher
// above won't fire on unmount.
onBeforeUnmount(closeViewer);
</script>

<template>
  <article class="h-full flex flex-col">
    <div
      v-if="!mailStore.messageBody && !mailStore.isLoadingMessage"
      class="flex-1 grid place-items-center text-sm text-muted-foreground"
    >
      <p>{{ t("selectPrompt") }}</p>
    </div>

    <div
      v-else-if="mailStore.isLoadingMessage"
      class="flex-1 grid place-items-center text-sm text-muted-foreground"
    >
      <p>{{ t("loading") }}</p>
    </div>

    <template v-else-if="mailStore.messageBody">
      <!-- Fixed action bar: only rendered when MessageView provides its own
           chrome (desktop 3-column layout). In mobile/fullscreen the page
           already renders an equivalent fixed header above this component. -->
      <header
        v-if="props.showActions !== false"
        class="h-12 shrink-0 border-b border-border flex items-center gap-1 px-2"
      >
        <span class="flex-1" />
        <UiButton
          variant="ghost"
          size="icon-lg"
          :icon="Reply"
          :tooltip="t('reply')"
          :aria-label="t('reply')"
          @click="emit('reply')"
        />
        <MailMoreMenu @reply-all="emit('replyAll')" @forward="emit('forward')" />
        <UiButton
          variant="ghost"
          size="icon-lg"
          :icon="Trash2"
          :tooltip="t('delete')"
          :aria-label="t('delete')"
          @click="emit('delete')"
        />
      </header>

      <div class="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <h1 class="text-xl font-semibold leading-snug mb-3">
          {{ mailStore.messageBody.envelope.subject ?? t("noSubject") }}
        </h1>
        <div class="flex items-start gap-3 pb-4 border-b border-border">
          <div
            class="shrink-0 size-14 rounded-full flex items-center justify-center text-base font-bold text-white select-none leading-none"
            :class="getAvatarColor(primarySender?.email ?? '')"
          >
            {{ getAvatarInitials(primarySender?.name, primarySender?.email ?? '') }}
          </div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm flex-1 min-w-0">
            <dt class="text-muted-foreground">{{ t("from") }}</dt>
            <dd>{{ formatAddresses(mailStore.messageBody.envelope.from) }}</dd>
            <dt class="text-muted-foreground">{{ t("to") }}</dt>
            <dd>{{ formatAddresses(mailStore.messageBody.envelope.to) }}</dd>
            <template v-if="mailStore.messageBody.envelope.cc?.length">
              <dt class="text-muted-foreground">Cc</dt>
              <dd>{{ formatAddresses(mailStore.messageBody.envelope.cc) }}</dd>
            </template>
          </dl>
          <div class="shrink-0 text-sm text-muted-foreground text-right leading-snug">
            <div>{{ formatDateLine(mailStore.messageBody.envelope.internalDate) }}</div>
            <div>{{ formatTimeLine(mailStore.messageBody.envelope.internalDate) }}</div>
          </div>
        </div>

        <!-- HTML content runs inside an iframe that is an opaque origin (no
             allow-same-origin) so email content can't reach the app/vault, and
             the vault CSP blocks all network. The email HTML is hardened
             (scripts/handlers stripped); the only script that runs is our
             injected bridge that forwards link clicks to the host, which opens
             them in the system browser. External resources are stripped by
             default and loaded on demand via the banner. -->
        <div
          v-if="uiStore.mailFormat === 'html' && mailStore.messageBody.bodyHtml"
          class="mt-4"
        >
          <div
            v-if="strippedHtml.hasExternal && !remoteApproved"
            class="flex items-center justify-between gap-3 rounded-t border border-b-0 border-border bg-muted px-3 py-2 text-sm"
          >
            <span class="text-muted-foreground">{{ t("externalBlocked") }}</span>
            <UiButton
              variant="secondary"
              size="sm"
              :loading="isLoadingRemote"
              @click="loadExternalAsync"
            >
              {{ t("loadExternal") }}
            </UiButton>
          </div>
          <iframe
            ref="mailFrame"
            :srcdoc="iframeSrcdoc"
            sandbox="allow-scripts"
            :style="{ height: `${iframeHeight ?? 200}px` }"
            :class="[
              'w-full border border-border',
              strippedHtml.hasExternal && !remoteApproved ? 'rounded-b' : 'rounded',
            ]"
          />
        </div>
        <div
          v-else
          class="whitespace-pre-wrap wrap-break-word font-sans text-sm mt-4"
        ><template v-for="(part, i) in textParts" :key="i"><a
          v-if="'url' in part"
          href="#"
          class="text-primary underline underline-offset-2"
          @click.prevent="openUrlAsync(part.url)"
        >{{ part.text }}</a><template v-else>{{ part.text }}</template></template></div>

        <details
          v-if="mailStore.messageBody.attachments.length > 0"
          class="group mt-6 pt-4 border-t border-border"
          open
        >
          <summary
            class="flex items-center gap-1.5 cursor-pointer select-none list-none text-sm font-medium mb-2 [&::-webkit-details-marker]:hidden"
          >
            <ChevronRight class="size-4 shrink-0 transition-transform group-open:rotate-90" />
            {{ t("attachments", { count: mailStore.messageBody.attachments.length }) }}
          </summary>
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
                :title="t('openAttachment')"
                @click="openAttachmentAsync(att)"
              >
                <span class="truncate font-medium">{{ att.filename ?? t("unnamed") }}</span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ effectiveType(att) }} ({{ Math.round(att.size / 1024) }} KB)
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
        </details>
      </div>
    </template>

    <!-- Inline attachment viewer (image / text). UiDrawerModal gives a
         responsive drawer/dialog with focus trap/restore, Escape and
         outside-click dismissal handled by the underlying primitive. -->
    <UiDrawerModal
      :open="!!viewer"
      :title="viewer?.filename || t('attachment')"
      :description="t('attachment')"
      content-class="w-full max-w-[calc(100%-2rem)] sm:max-w-5xl h-[85vh]"
      @update:open="onViewerOpenChange"
    >
      <template #content>
        <div class="h-full overflow-auto grid place-items-center bg-muted/30">
          <img
            v-if="viewer?.kind === 'image'"
            :src="viewer.url"
            :alt="viewer.filename"
            class="max-w-full max-h-full object-contain"
          >
          <pre
            v-else-if="viewer?.kind === 'text'"
            class="w-full h-full self-start whitespace-pre-wrap font-mono text-sm p-4"
          >{{ viewer.text }}</pre>
        </div>
      </template>
    </UiDrawerModal>
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
  externalBlocked: Externe Inhalte (z. B. Bilder) wurden blockiert.
  loadExternal: Inhalte laden
  attachments: "Anhänge ({count})"
  attachment: Anhang
  unnamed: (unbenannt)
  openAttachment: Anhang öffnen
  downloadAttachment: Anhang herunterladen
  reply: Antworten
  delete: Löschen
en:
  selectPrompt: Select a message.
  loading: Loading message…
  noSubject: (no subject)
  from: From
  to: To
  emptyBody: (empty)
  externalBlocked: External content (e.g. images) was blocked.
  loadExternal: Load content
  attachments: "Attachments ({count})"
  attachment: Attachment
  unnamed: (unnamed)
  openAttachment: Open attachment
  downloadAttachment: Download attachment
  reply: Reply
  delete: Delete
</i18n>
