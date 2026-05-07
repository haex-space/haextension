<script setup lang="ts">
import type { ConnectionSecurity } from "@haex-space/vault-sdk";

const emit = defineEmits<{ complete: [] }>();

const accountsStore = useAccountsStore();

const displayName = ref("");
const email = ref("");
const password = ref("");

const imapHost = ref("");
const imapPort = ref(993);
const imapSecurity = ref<ConnectionSecurity>("tls");

const smtpHost = ref("");
const smtpPort = ref(465);
const smtpSecurity = ref<ConnectionSecurity>("tls");

const isSubmitting = ref(false);
const error = ref<string | null>(null);

/**
 * Naive provider auto-detection from the email domain. Covers Gmail,
 * Outlook/Microsoft, iCloud, Yahoo. For unknown domains the user fills
 * in the host fields manually.
 */
const onEmailBlur = () => {
  if (!email.value.includes("@")) return;
  const domain = email.value.split("@")[1]!.toLowerCase();
  const preset = PROVIDER_PRESETS[domain];
  if (preset) {
    imapHost.value = preset.imapHost;
    imapPort.value = preset.imapPort;
    imapSecurity.value = preset.imapSecurity;
    smtpHost.value = preset.smtpHost;
    smtpPort.value = preset.smtpPort;
    smtpSecurity.value = preset.smtpSecurity;
  } else if (!imapHost.value) {
    // Sensible default: imap.<domain>, smtp.<domain>.
    imapHost.value = `imap.${domain}`;
    smtpHost.value = `smtp.${domain}`;
  }
};

const submitAsync = async () => {
  error.value = null;
  isSubmitting.value = true;
  try {
    await accountsStore.createAccountAsync({
      displayName: displayName.value || email.value,
      email: email.value,
      password: password.value,
      imapHost: imapHost.value,
      imapPort: imapPort.value,
      imapSecurity: imapSecurity.value,
      smtpHost: smtpHost.value || undefined,
      smtpPort: smtpPort.value,
      smtpSecurity: smtpSecurity.value,
    });
    emit("complete");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isSubmitting.value = false;
  }
};

interface ProviderPreset {
  imapHost: string;
  imapPort: number;
  imapSecurity: ConnectionSecurity;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: ConnectionSecurity;
}

const GMAIL: ProviderPreset = {
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSecurity: "tls",
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecurity: "tls",
};

const OUTLOOK: ProviderPreset = {
  imapHost: "outlook.office365.com",
  imapPort: 993,
  imapSecurity: "tls",
  smtpHost: "smtp.office365.com",
  smtpPort: 587,
  smtpSecurity: "startTls",
};

const ICLOUD: ProviderPreset = {
  imapHost: "imap.mail.me.com",
  imapPort: 993,
  imapSecurity: "tls",
  smtpHost: "smtp.mail.me.com",
  smtpPort: 587,
  smtpSecurity: "startTls",
};

const YAHOO: ProviderPreset = {
  imapHost: "imap.mail.yahoo.com",
  imapPort: 993,
  imapSecurity: "tls",
  smtpHost: "smtp.mail.yahoo.com",
  smtpPort: 465,
  smtpSecurity: "tls",
};

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  "gmail.com": GMAIL,
  "googlemail.com": GMAIL,
  "outlook.com": OUTLOOK,
  "hotmail.com": OUTLOOK,
  "live.com": OUTLOOK,
  "office365.com": OUTLOOK,
  "icloud.com": ICLOUD,
  "me.com": ICLOUD,
  "mac.com": ICLOUD,
  "yahoo.com": YAHOO,
  "yahoo.de": YAHOO,
  "ymail.com": YAHOO,
};
</script>

<template>
  <div class="h-full overflow-y-auto p-8 grid place-items-center">
    <form
      class="w-full max-w-2xl space-y-6"
      @submit.prevent="submitAsync"
    >
      <header class="space-y-1">
        <h1 class="text-2xl font-semibold">Mail-Konto einrichten</h1>
        <p class="text-sm text-muted-foreground">
          Dein Passwort wird im Passwort-Tresor von haex-vault gespeichert
          (Tag <code>haex-mail</code>).
        </p>
      </header>

      <section class="space-y-3">
        <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Konto
        </h2>
        <label class="block space-y-1">
          <span class="text-sm">Anzeigename</span>
          <UiInput v-model="displayName" placeholder="z.B. Privates Gmail" />
        </label>
        <label class="block space-y-1">
          <span class="text-sm">E-Mail</span>
          <UiInput
            v-model="email"
            type="email"
            placeholder="name@example.com"
            required
            @blur="onEmailBlur"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-sm">Passwort (oder App-Password)</span>
          <UiInput v-model="password" type="password" required />
          <p class="text-xs text-muted-foreground">
            Bei Gmail/Outlook ein App-spezifisches Passwort verwenden.
          </p>
        </label>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          IMAP (Empfang)
        </h2>
        <div class="grid grid-cols-[1fr_120px_140px] gap-3">
          <UiInput v-model="imapHost" placeholder="imap.example.com" required />
          <UiInput v-model.number="imapPort" type="number" placeholder="Port" required />
          <select
            v-model="imapSecurity"
            class="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="tls">TLS</option>
            <option value="startTls" disabled>STARTTLS (Phase 2)</option>
            <option value="none" disabled>Plain (Phase 2)</option>
          </select>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          SMTP (Versand)
        </h2>
        <div class="grid grid-cols-[1fr_120px_140px] gap-3">
          <UiInput v-model="smtpHost" placeholder="smtp.example.com (optional)" />
          <UiInput v-model.number="smtpPort" type="number" placeholder="Port" />
          <select
            v-model="smtpSecurity"
            class="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="tls">TLS (465)</option>
            <option value="startTls">STARTTLS (587)</option>
          </select>
        </div>
      </section>

      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <UiButton type="submit" :loading="isSubmitting">
          Konto speichern
        </UiButton>
      </div>
    </form>
  </div>
</template>
