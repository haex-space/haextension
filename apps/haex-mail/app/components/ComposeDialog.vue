<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { OutgoingMessage } from "@haex-space/vault-sdk";
import type { AccountWithCredentials } from "~/stores/accounts";

const open = defineModel<boolean>("open", { default: false });

/**
 * Without an account (unified view) the dialog shows a "Von" select and
 * resolves the chosen account's credentials on send.
 */
const props = defineProps<{
  account?: AccountWithCredentials;
  replyTo?: { accountId: string; to: string; subject: string };
}>();

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const accountsStore = useAccountsStore();

const to = ref("");
const cc = ref("");
const subject = ref("");
const body = ref("");
const fromAccountId = ref<string | null>(null);
const isSending = ref(false);
const error = ref<string | null>(null);

const reset = () => {
  to.value = "";
  cc.value = "";
  subject.value = "";
  body.value = "";
  error.value = null;
};

const applyReplyTo = () => {
  if (!props.replyTo) return;
  to.value = props.replyTo.to;
  subject.value = props.replyTo.subject;
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

const sendAsync = async () => {
  error.value = null;
  isSending.value = true;
  try {
    const account =
      props.account ??
      (fromAccountId.value
        ? await accountsStore.getCredentialsCachedAsync(fromAccountId.value)
        : null);
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
      subject: subject.value,
      bodyText: body.value || undefined,
    };
    await haexVault.client.mail.sendMessageAsync(account.smtp, message);
    open.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isSending.value = false;
  }
};
</script>

<template>
  <!-- Bottom-right card overlay reminiscent of Gmail's compose window -->
  <div
    v-if="open"
    class="fixed bottom-4 right-4 w-[560px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] bg-background border border-border rounded-lg shadow-xl flex flex-col"
  >
    <header class="h-12 flex items-center justify-between pl-4 pr-1 border-b border-border bg-muted/50 rounded-t-lg">
      <h2 class="text-sm font-medium">{{ t("title") }}</h2>
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="X"
        :aria-label="t('close')"
        @click="open = false"
      />
    </header>

    <form
      class="flex-1 flex flex-col overflow-hidden"
      @submit.prevent="sendAsync"
    >
      <div class="px-4 py-2 space-y-2 border-b border-border">
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
        <UiInput v-model="cc" :placeholder="t('ccPlaceholder')" />
        <UiInput v-model="subject" :placeholder="t('subjectPlaceholder')" />
      </div>

      <textarea
        v-model="body"
        class="flex-1 w-full px-4 py-3 text-sm bg-transparent resize-none focus:outline-none"
        :placeholder="t('bodyPlaceholder')"
      />

      <p v-if="error" class="px-4 pb-1 text-sm text-destructive">{{ error }}</p>

      <footer class="h-14 flex items-center justify-end gap-2 px-4 border-t border-border">
        <UiButton type="button" variant="ghost" size="lg" @click="open = false">
          {{ t("discard") }}
        </UiButton>
        <UiButton type="submit" size="lg" :loading="isSending">{{ t("send") }}</UiButton>
      </footer>
    </form>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Neue Nachricht
  close: Schließen
  from: Von
  fromAccount: Absenderkonto
  toPlaceholder: An (mehrere mit Komma trennen)
  ccPlaceholder: Cc (optional)
  subjectPlaceholder: Betreff
  bodyPlaceholder: Nachricht schreiben…
  discard: Verwerfen
  send: Senden
  errors:
    noFromAccount: Kein Absenderkonto gewählt.
    noSmtp: Dieses Konto hat keine SMTP-Konfiguration.
en:
  title: New message
  close: Close
  from: From
  fromAccount: Sender account
  toPlaceholder: To (separate multiple with commas)
  ccPlaceholder: Cc (optional)
  subjectPlaceholder: Subject
  bodyPlaceholder: Write a message…
  discard: Discard
  send: Send
  errors:
    noFromAccount: No sender account selected.
    noSmtp: This account has no SMTP configuration.
</i18n>
