<script setup lang="ts">
import { X } from "lucide-vue-next";
import { toast } from "vue-sonner";
import type { OutgoingMessage } from "@haex-space/vault-sdk";
import { getErrorMessage } from "~/lib/utils";
import type { AccountWithCredentials } from "~/stores/accounts";
import type { ReplyContext } from "~/stores/mail";

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
const body = ref("");
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
      body.value.trim()
    ),
);

const reset = () => {
  to.value = "";
  cc.value = "";
  bcc.value = "";
  subject.value = "";
  body.value = "";
  showCc.value = false;
  showBcc.value = false;
  error.value = null;
};

const applyReplyTo = () => {
  if (!props.replyTo) return;
  to.value = props.replyTo.to;
  subject.value = props.replyTo.subject;
  // Quoted original (cursor stays at the top, before the quote).
  if (props.replyTo.body) body.value = props.replyTo.body;
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

const parseAddresses = (input: string) => {
  return input
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
};

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
    const message: OutgoingMessage = {
      from: { email: account.account.email, name: account.account.displayName },
      to: parseAddresses(to.value),
      cc: cc.value ? parseAddresses(cc.value) : [],
      bcc: bcc.value ? parseAddresses(bcc.value) : [],
      subject: subject.value,
      bodyText: body.value || undefined,
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
 * Best-effort — failures are logged but not surfaced to the user.
 */
const saveDraftAsync = async () => {
  if (!isDirty.value) return;

  // Snapshot before any async gap.
  const snap = {
    to: to.value,
    cc: cc.value,
    bcc: bcc.value,
    subject: subject.value,
    body: body.value,
  };

  isSavingDraft.value = true;
  try {
    const account = await resolveAccount();
    if (!account) return;

    const draftsMailbox = mailStore.mailboxes.find(
      (m) => m.accountId === account.account.id && m.role === "drafts",
    );
    if (!draftsMailbox) return;

    const message: OutgoingMessage = {
      from: { email: account.account.email, name: account.account.displayName },
      to: snap.to ? parseAddresses(snap.to) : [],
      cc: snap.cc ? parseAddresses(snap.cc) : [],
      bcc: snap.bcc ? parseAddresses(snap.bcc) : [],
      subject: snap.subject || t("noSubject"),
      bodyText: snap.body || undefined,
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
  } catch (err) {
    console.warn("[haex-mail] failed to save draft", err);
  } finally {
    isSavingDraft.value = false;
  }
};

/** Close and save draft if the form has content. */
const closeAsync = async () => {
  if (isDirty.value) {
    await saveDraftAsync();
  }
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

          <!-- Cc / Bcc toggles -->
          <div v-if="!showCc || !showBcc" class="flex gap-3">
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
          </div>

          <UiInput v-if="showCc" v-model="cc" :placeholder="t('ccPlaceholder')" />
          <UiInput v-if="showBcc" v-model="bcc" :placeholder="t('bccPlaceholder')" />

          <UiInput v-model="subject" :placeholder="t('subjectPlaceholder')" />
        </div>

        <textarea
          v-model="body"
          class="flex-1 w-full px-4 py-4 text-sm bg-transparent resize-none focus:outline-none"
          :placeholder="t('bodyPlaceholder')"
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
  draftSaved: Entwurf gespeichert
  noSubject: (kein Betreff)
  errors:
    noFromAccount: Kein Absenderkonto gewählt.
    noSmtp: Dieses Konto hat keine SMTP-Konfiguration.
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
  draftSaved: Draft saved
  noSubject: (no subject)
  errors:
    noFromAccount: No sender account selected.
    noSmtp: This account has no SMTP configuration.
</i18n>
