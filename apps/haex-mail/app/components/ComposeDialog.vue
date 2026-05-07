<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { OutgoingMessage } from "@haex-space/vault-sdk";
import type { AccountWithCredentials } from "~/stores/accounts";

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  account: AccountWithCredentials;
}>();

const haexVault = useHaexVaultStore();

const to = ref("");
const cc = ref("");
const subject = ref("");
const body = ref("");
const isSending = ref(false);
const error = ref<string | null>(null);

const reset = () => {
  to.value = "";
  cc.value = "";
  subject.value = "";
  body.value = "";
  error.value = null;
};

watch(open, (v) => {
  if (!v) reset();
});

const parseAddresses = (input: string) => {
  return input
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
};

const sendAsync = async () => {
  if (!props.account.smtp) {
    error.value = "Dieses Konto hat keine SMTP-Konfiguration.";
    return;
  }
  error.value = null;
  isSending.value = true;
  try {
    const message: OutgoingMessage = {
      from: { email: props.account.account.email, name: props.account.account.displayName },
      to: parseAddresses(to.value),
      cc: cc.value ? parseAddresses(cc.value) : [],
      subject: subject.value,
      bodyText: body.value || undefined,
    };
    await haexVault.client.mail.sendMessageAsync(props.account.smtp, message);
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
    <header class="h-10 flex items-center justify-between px-4 border-b border-border bg-muted/50 rounded-t-lg">
      <h2 class="text-sm font-medium">Neue Nachricht</h2>
      <button
        class="p-1 rounded hover:bg-accent"
        aria-label="Schließen"
        @click="open = false"
      >
        <X class="size-4" />
      </button>
    </header>

    <form
      class="flex-1 flex flex-col overflow-hidden"
      @submit.prevent="sendAsync"
    >
      <div class="px-4 py-2 space-y-2 border-b border-border">
        <UiInput v-model="to" placeholder="An (mehrere mit Komma trennen)" required />
        <UiInput v-model="cc" placeholder="Cc (optional)" />
        <UiInput v-model="subject" placeholder="Betreff" />
      </div>

      <textarea
        v-model="body"
        class="flex-1 w-full px-4 py-3 text-sm bg-transparent resize-none focus:outline-none"
        placeholder="Nachricht schreiben…"
      />

      <p v-if="error" class="px-4 pb-1 text-sm text-destructive">{{ error }}</p>

      <footer class="h-12 flex items-center justify-end gap-2 px-4 border-t border-border">
        <UiButton type="button" variant="ghost" @click="open = false">Verwerfen</UiButton>
        <UiButton type="submit" :loading="isSending">Senden</UiButton>
      </footer>
    </form>
  </div>
</template>
