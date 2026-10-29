<script setup lang="ts">
import { Paperclip, X } from "@lucide/vue";
import { toast } from "vue-sonner";
import type { OutgoingAttachment, OutgoingMessage } from "@haex-space/vault-sdk";
import { parseAddressList } from "~/lib/address";
import { bodyNeedsHtml, bodyToHtml, bodyToText, textToBody } from "~/lib/composeBody";
import { getErrorMessage } from "~/lib/utils";
import type { AccountWithCredentials } from "~/stores/accounts";
import type { ReplyContext } from "~/stores/mail/reply";

const open = defineModel<boolean>("open", { default: false });

/**
 * Without an account (unified view) the dialog shows a "Von" select and
 * resolves the chosen account's credentials on send.
 */
const props = defineProps<{
  account?: AccountWithCredentials;
  replyTo?: ReplyContext;
}>();

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const accountsStore = useAccountsStore();
const mailStore = useMailStore();

const to = ref("");
const cc = ref("");
const bcc = ref("");
const subject = ref("");
/** Raw editor HTML — `bodyContent()` turns it into what gets sent. */
const body = ref("");
const attachments = ref<OutgoingAttachment[]>([]);
const fromAccountId = ref<string | null>(null);
const isSending = ref(false);
const isSavingDraft = ref(false);
const error = ref<string | null>(null);
const showCc = ref(false);
const showBcc = ref(false);

const isDirty = computed(
  () =>
    !!(
      to.value.trim() ||
      cc.value.trim() ||
      bcc.value.trim() ||
      subject.value.trim() ||
      bodyToText(body.value).trim() ||
      attachments.value.length
    ),
);

/** Plain text always; HTML only when formatting or a link needs it, so other mails stay plain text. */
const bodyContent = (html: string) => {
  const text = bodyToText(html);
  return {
    bodyText: text || undefined,
    bodyHtml: bodyNeedsHtml(html) ? bodyToHtml(html) : undefined,
  };
};

/** Approximate decoded byte size of a base64 payload (for display). */
const attachmentBytes = (data: string) => Math.floor((data.length * 3) / 4);

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;

const removeAttachment = (index: number) => {
  attachments.value.splice(index, 1);
};

const fileInput = ref<HTMLInputElement>();

/** Reads a File as base64 (no `data:` URL prefix — SDK expects raw base64). */
const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const onFilesPicked = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files ?? []);
  try {
    for (const file of files) {
      attachments.value.push({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        data: await fileToBase64(file),
      });
    }
  } catch (err) {
    error.value = getErrorMessage(err);
  } finally {
    target.value = "";
  }
};

const reset = () => {
  to.value = "";
  cc.value = "";
  bcc.value = "";
  subject.value = "";
  body.value = "";
  attachments.value = [];
  showCc.value = false;
  showBcc.value = false;
  error.value = null;
};

const applyReplyTo = () => {
  if (!props.replyTo) return;
  to.value = props.replyTo.to;
  if (props.replyTo.cc) {
    cc.value = props.replyTo.cc;
    showCc.value = true;
  }
  attachments.value = props.replyTo.attachments
    ? [...props.replyTo.attachments]
    : [];
  subject.value = props.replyTo.subject;
  // Quoted original (cursor stays at the top, before the quote).
  if (props.replyTo.body) body.value = textToBody(props.replyTo.body);
  // Unified view: reply from the account the message was received on.
  if (!props.account) fromAccountId.value = props.replyTo.accountId;
};

watch(open, (v) => {
  if (!v) {
    reset();
    return;
  }
  fromAccountId.value ??= accountsStore.accounts[0]?.id ?? null;
  applyReplyTo();
});

// Reply triggered while the dialog is already open must still prefill.
watch(
  () => props.replyTo,
  () => {
    if (open.value) applyReplyTo();
  },
);

/** Valid recipients of a field; a draft keeps what it can, a send refuses invalid ones. */
const recipientsOf = (input: string) => parseAddressList(input).addresses;

const resolveAccount = async (): Promise<AccountWithCredentials | null> => {
  return (
    props.account ??
    (fromAccountId.value
      ? await accountsStore.getCredentialsCachedAsync(fromAccountId.value)
      : null)
  );
};

const sendAsync = async () => {
  error.value = null;
  isSending.value = true;
  try {
    const account = await resolveAccount();
    if (!account) {
      error.value = t("errors.noFromAccount");
      return;
    }
    if (!account.smtp) {
      error.value = t("errors.noSmtp");
      return;
    }
    const invalid = [to.value, cc.value, bcc.value].flatMap((f) => parseAddressList(f).invalid);
    if (invalid.length > 0) {
      error.value = t("errors.invalidAddress", { addresses: invalid.join(", ") });
      return;
    }
    const message: OutgoingMessage = {
      from: { email: account.account.email, name: account.account.displayName },
      to: recipientsOf(to.value),
      cc: recipientsOf(cc.value),
      bcc: recipientsOf(bcc.value),
      subject: subject.value,
      ...bodyContent(body.value),
      attachments: attachments.value.length ? attachments.value : undefined,
      // Threading headers so replies land in the original conversation.
      inReplyTo: props.replyTo?.inReplyTo,
      references: props.replyTo?.references,
    };
    await haexVault.client.mail.sendMessageAsync(account.smtp, message);
    open.value = false;
  } catch (err) {
    error.value = getErrorMessage(err);
  } finally {
    isSending.value = false;
  }
};

/**
 * Save the current draft to the account's Drafts folder via IMAP APPEND.
 * Snapshots field values up-front so async gaps don't race with reset().
 * Returns false, with `error` set, when the draft could not be stored.
 */
const saveDraftAsync = async (): Promise<boolean> => {
  if (!isDirty.value) return true;

  // Snapshot before any async gap.
  const snap = {
    to: to.value,
    cc: cc.value,
    bcc: bcc.value,
    subject: subject.value,
    body: body.value,
    attachments: attachments.value.slice(),
  };

  isSavingDraft.value = true;
  try {
    const account = await resolveAccount();
    if (!account) {
      error.value = t("errors.noFromAccount");
      return false;
    }

    const draftsMailbox = mailStore.mailboxes.find(
      (m) => m.accountId === account.account.id && m.role === "drafts",
    );
    if (!draftsMailbox) {
      error.value = t("errors.noDraftsFolder");
      return false;
    }

    const message: OutgoingMessage = {
      from: { email: account.account.email, name: account.account.displayName },
      to: recipientsOf(snap.to),
      cc: recipientsOf(snap.cc),
      bcc: recipientsOf(snap.bcc),
      subject: snap.subject || t("noSubject"),
      ...bodyContent(snap.body),
      attachments: snap.attachments.length ? snap.attachments : undefined,
    };
    const rfc822 = await haexVault.client.mail.buildRfc822Async(
      account.imap.host,
      message,
    );
    await haexVault.client.mail.appendMessageAsync(
      account.imap,
      draftsMailbox.name,
      rfc822,
      ["\\Draft", "\\Seen"],
    );
    toast.success(t("draftSaved"));
    return true;
  } catch (err) {
    error.value = t("errors.draftFailed", { error: getErrorMessage(err) });
    return false;
  } finally {
    isSavingDraft.value = false;
  }
};

/** Close, saving a draft if the form has content; stays open if that fails. */
const closeAsync = async () => {
  if (!(await saveDraftAsync())) return;
  reset();
  open.value = false;
};

/** Discard without saving a draft. */
const discardAsync = () => {
  reset();
  open.value = false;
};
</script>

<template>
  <!-- Full-screen compose overlay -->
  <Transition name="compose-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-50 bg-background flex flex-col"
    >
      <header class="h-14 shrink-0 flex items-center justify-between pl-4 pr-2 border-b border-border">
        <h2 class="text-base font-semibold">{{ t("title") }}</h2>
        <UiButton
          variant="ghost"
          size="icon-lg"
          :icon="X"
          :aria-label="t('close')"
          :loading="isSavingDraft"
          @click="closeAsync"
        />
      </header>

      <form
        class="flex-1 flex flex-col overflow-hidden"
        @submit.prevent="sendAsync"
      >
        <div class="px-4 py-3 space-y-2 border-b border-border">
          <ShadcnSelect v-if="!props.account" v-model="fromAccountId">
            <ShadcnSelectTrigger class="w-full" :aria-label="t('fromAccount')">
              <ShadcnSelectValue :placeholder="t('from')" />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem
                v-for="acc in accountsStore.accounts"
                :key="acc.id"
                :value="acc.id"
              >
                {{ acc.email }}
              </ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>

          <UiInput v-model="to" :placeholder="t('toPlaceholder')" required />

          <!-- Cc / Bcc toggles / attachments -->
          <div class="flex items-center gap-3">
            <button
              v-if="!showCc"
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground transition-colors"
              @click="showCc = true"
            >
              + Cc
            </button>
            <button
              v-if="!showBcc"
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground transition-colors"
              @click="showBcc = true"
            >
              + Bcc
            </button>
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              @click="fileInput?.click()"
            >
              <Paperclip class="size-3.5" />
              {{ t("addAttachment") }}
            </button>
            <input
              ref="fileInput"
              type="file"
              multiple
              class="hidden"
              @change="onFilesPicked"
            />
          </div>

          <UiInput v-if="showCc" v-model="cc" :placeholder="t('ccPlaceholder')" />
          <UiInput v-if="showBcc" v-model="bcc" :placeholder="t('bccPlaceholder')" />

          <UiInput v-model="subject" :placeholder="t('subjectPlaceholder')" />

          <ul v-if="attachments.length" class="flex flex-wrap gap-2 pt-1">
            <li
              v-for="(att, i) in attachments"
              :key="i"
              class="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 pl-2 pr-1 py-1 text-xs"
            >
              <Paperclip class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate max-w-48">{{ att.filename }}</span>
              <span class="text-muted-foreground">({{ formatSize(attachmentBytes(att.data)) }})</span>
              <button
                type="button"
                class="ml-0.5 rounded p-0.5 hover:bg-accent"
                :aria-label="t('removeAttachment')"
                @click="removeAttachment(i)"
              >
                <X class="size-3.5" />
              </button>
            </li>
          </ul>
        </div>

        <ComposeEditor v-model="body" :placeholder="t('bodyPlaceholder')" />

        <p v-if="error" class="px-4 pb-1 text-sm text-destructive">{{ error }}</p>

        <footer class="h-14 shrink-0 flex items-center justify-end gap-2 px-4 border-t border-border">
          <UiButton type="button" variant="ghost" size="lg" @click="discardAsync">
            {{ t("discard") }}
          </UiButton>
          <UiButton type="submit" size="lg" :loading="isSending">{{ t("send") }}</UiButton>
        </footer>
      </form>
    </div>
  </Transition>
</template>

<style scoped>
.compose-fade-enter-active,
.compose-fade-leave-active {
  transition: opacity 0.12s ease;
}
.compose-fade-enter-from,
.compose-fade-leave-to {
  opacity: 0;
}
</style>

<i18n lang="yaml">
de:
  title: Neue Nachricht
  close: Schließen
  from: Von
  fromAccount: Absenderkonto
  toPlaceholder: An (mehrere mit Komma trennen)
  ccPlaceholder: Cc
  bccPlaceholder: Bcc
  subjectPlaceholder: Betreff
  bodyPlaceholder: Nachricht schreiben…
  discard: Verwerfen
  send: Senden
  addAttachment: Anhang hinzufügen
  removeAttachment: Anhang entfernen
  draftSaved: Entwurf gespeichert
  noSubject: (kein Betreff)
  errors:
    noFromAccount: Kein Absenderkonto gewählt.
    noSmtp: Dieses Konto hat keine SMTP-Konfiguration.
    invalidAddress: "Keine gültige E-Mail-Adresse: {addresses}"
    noDraftsFolder: "Kein Entwürfe-Ordner gefunden – Entwurf nicht gespeichert. Mit „Verwerfen“ schließen."
    draftFailed: "Entwurf nicht gespeichert: {error}"
en:
  title: New message
  close: Close
  from: From
  fromAccount: Sender account
  toPlaceholder: To (separate multiple with commas)
  ccPlaceholder: Cc
  bccPlaceholder: Bcc
  subjectPlaceholder: Subject
  bodyPlaceholder: Write a message…
  discard: Discard
  send: Send
  addAttachment: Add attachment
  removeAttachment: Remove attachment
  draftSaved: Draft saved
  noSubject: (no subject)
  errors:
    noFromAccount: No sender account selected.
    noSmtp: This account has no SMTP configuration.
    invalidAddress: "Not a valid email address: {addresses}"
    noDraftsFolder: "No drafts folder found – draft not saved. Use “Discard” to close."
    draftFailed: "Draft not saved: {error}"
</i18n>
