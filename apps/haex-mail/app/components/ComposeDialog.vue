<script setup lang="ts">
import { Paperclip, X } from "@lucide/vue";
import type { OutgoingAttachment } from "@haex-space/vault-sdk";
import { parseAddressList } from "~/lib/address";
import { bodyNeedsHtml, bodyToHtml, bodyToText, textToBody } from "~/lib/composeBody";
import type { DraftFields } from "~/lib/drafts";
import type { ComposePrefill } from "~/lib/openers";
import { buildOutgoingMessage } from "~/lib/outgoing";
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
const ui = useUiStore();

const to = ref("");
const cc = ref("");
const bcc = ref("");
const subject = ref("");
/** Raw editor HTML — `bodyContent()` turns it into what gets sent. */
const body = ref("");
const attachments = ref<OutgoingAttachment[]>([]);
const fromAccountId = ref<string | null>(null);
/** Threading headers of the mail being answered; a draft keeps them, so a reply stays a reply. */
const inReplyTo = ref<string | undefined>();
const references = ref<string[]>([]);
const isSending = ref(false);
const error = ref<string | null>(null);
const showCc = ref(false);
const showBcc = ref(false);
const confirmDiscardOpen = ref(false);

const { fileInput, attachmentBytes, formatSize, removeAttachment, addFilesAsync, onFilesPicked } =
  useComposeAttachments(attachments, error);

/** Plain text always; HTML only when formatting or a link needs it, so other mails stay plain text. */
const bodyContent = (html: string) => {
  const text = bodyToText(html);
  return {
    bodyText: text || undefined,
    bodyHtml: bodyNeedsHtml(html) ? bodyToHtml(html) : undefined,
  };
};

/** The mail as plain data: it goes to the host, which refuses Vue proxies. */
const snapshot = (): DraftFields => ({
  accountId: fromAccountId.value ?? "",
  to: to.value,
  cc: cc.value,
  bcc: bcc.value,
  subject: subject.value,
  bodyHtml: body.value,
  inReplyTo: inReplyTo.value,
  references: [...references.value],
  attachments: attachments.value.map((a) => ({ ...a })),
});

const draftFailed = (err: unknown) => t("errors.draftFailed", { error: getErrorMessage(err) });

// Every mail with content is a draft a moment after the last change (spec 022).
const autosave = useDraftAutosave({
  snapshot,
  sources: [to, cc, bcc, subject, body, fromAccountId, () => attachments.value.length],
  drafts: useDraftsStore(),
  onError: (err) => {
    error.value = draftFailed(err);
  },
});

const reset = () => {
  to.value = "";
  cc.value = "";
  bcc.value = "";
  subject.value = "";
  body.value = "";
  attachments.value = [];
  inReplyTo.value = undefined;
  references.value = [];
  showCc.value = false;
  showBcc.value = false;
  error.value = null;
};

/** The account the mail is sent from: the one shown, else the one chosen, else the first. */
const selectAccount = () => {
  fromAccountId.value =
    props.account?.account.id ?? fromAccountId.value ?? accountsStore.accounts[0]?.id ?? null;
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
  inReplyTo.value = props.replyTo.inReplyTo;
  references.value = props.replyTo.references ?? [];
  // Quoted original (cursor stays at the top, before the quote).
  if (props.replyTo.body) body.value = textToBody(props.replyTo.body);
  // Unified view: reply from the account the message was received on.
  if (!props.account) fromAccountId.value = props.replyTo.accountId;
};

const applyPrefill = (prefill: ComposePrefill) => {
  to.value = prefill.to;
  cc.value = prefill.cc;
  bcc.value = prefill.bcc;
  showCc.value = !!prefill.cc;
  showBcc.value = !!prefill.bcc;
  subject.value = prefill.subject;
  if (prefill.body) body.value = textToBody(prefill.body);
};

// A new mail never replaces the one being written: `switchTo` writes that one as a draft first.
const startPlainAsync = () =>
  autosave.switchTo(
    () => {
      reset();
      selectAccount();
      applyReplyTo();
    },
    { baselineIsApplied: !!props.replyTo },
  );

/** The fields of a mail link (`openers.client.ts`) start a draft of their own, which exists at once. */
const startLinkAsync = (prefill: ComposePrefill) =>
  autosave.switchTo(
    () => {
      reset();
      selectAccount();
      applyPrefill(prefill);
    },
    { saveNow: true },
  );

const takePrefill = () => {
  const prefill = ui.composePrefill;
  ui.composePrefill = null;
  return prefill;
};

const closedAsync = async () => {
  try {
    await autosave.endAsync();
  } finally {
    reset();
  }
};

useComposeLifecycle({
  open,
  replyTo: () => props.replyTo,
  prefill: () => ui.composePrefill,
  takePrefill,
  startPlain: startPlainAsync,
  startLink: startLinkAsync,
  closed: closedAsync,
  onError: (err) => {
    error.value = draftFailed(err);
  },
});

onBeforeUnmount(() => {
  autosave.dispose();
  void autosave.flushAsync().catch((err) => console.warn("[haex-mail] draft not saved on unmount", err));
});

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
    const message = buildOutgoingMessage(
      { email: account.account.email, name: account.account.displayName },
      {
        to: to.value,
        cc: cc.value,
        bcc: bcc.value,
        subject: subject.value,
        ...bodyContent(body.value),
        attachments: attachments.value,
        // Threading headers so replies land in the original conversation.
        inReplyTo: inReplyTo.value,
        references: references.value,
      },
    );
    await haexVault.client.mail.sendMessageAsync(account.smtp, message);
    // Sent: the draft has done its job. A draft that cannot be removed is not the person's problem now.
    await autosave.discardAsync().catch((err) => console.warn("[haex-mail] sent draft not removed", err));
    open.value = false;
  } catch (err) {
    error.value = getErrorMessage(err);
  } finally {
    isSending.value = false;
  }
};

/** Close: the mail is already a draft, so this only makes sure the last change is written. */
const closeAsync = async () => {
  try {
    await autosave.flushAsync();
  } catch (err) {
    error.value = draftFailed(err);
    return;
  }
  open.value = false;
};

/** Throw the mail away: with content it asks once, because the draft goes with it. */
const discardAsync = () => {
  if (autosave.hasContent()) confirmDiscardOpen.value = true;
  else open.value = false;
};

const confirmDiscardAsync = async () => {
  try {
    await autosave.discardAsync();
  } catch (err) {
    error.value = draftFailed(err);
    return;
  }
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

        <ComposeEditor
          v-model="body"
          :placeholder="t('bodyPlaceholder')"
          @attach="fileInput?.click()"
          @files="addFilesAsync"
        />

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

  <ShadcnDialogConfirm
    v-model:open="confirmDiscardOpen"
    :title="t('discardConfirm.title')"
    :description="t('discardConfirm.description')"
    :confirm-label="t('discardConfirm.confirm')"
    :abort-label="t('discardConfirm.abort')"
    @confirm="confirmDiscardAsync"
  />
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
  discardConfirm:
    title: Entwurf verwerfen?
    description: Die Nachricht und der gespeicherte Entwurf werden gelöscht.
    confirm: Verwerfen
    abort: Abbrechen
  noSubject: (kein Betreff)
  errors:
    noFromAccount: Kein Absenderkonto gewählt.
    noSmtp: Dieses Konto hat keine SMTP-Konfiguration.
    invalidAddress: "Keine gültige E-Mail-Adresse: {addresses}"
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
  discardConfirm:
    title: Discard this draft?
    description: The message and its saved draft will be deleted.
    confirm: Discard
    abort: Cancel
  noSubject: (no subject)
  errors:
    noFromAccount: No sender account selected.
    noSmtp: This account has no SMTP configuration.
    invalidAddress: "Not a valid email address: {addresses}"
    draftFailed: "Draft not saved: {error}"
</i18n>
