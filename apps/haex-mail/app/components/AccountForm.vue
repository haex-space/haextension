<script setup lang="ts">
import type { ConnectionSecurity } from "@haex-space/vault-sdk";
import type * as schema from "~/database/schemas";

/**
 * Account form used both by the setup wizard (create) and the settings
 * page (edit). In edit mode the password field stays empty — leaving it
 * empty keeps the stored password unchanged.
 */
const props = defineProps<{
  account?: schema.SelectAccount;
}>();

const emit = defineEmits<{ saved: [] }>();

const accountsStore = useAccountsStore();

const isEdit = computed(() => !!props.account);

const displayName = ref(props.account?.displayName ?? "");
const email = ref(props.account?.email ?? "");
const password = ref("");

const imapHost = ref(props.account?.imapHost ?? "");
const imapPort = ref(props.account?.imapPort ?? 993);
const imapSecurity = ref<ConnectionSecurity>(
  (props.account?.imapSecurity as ConnectionSecurity) ?? "tls",
);

const smtpHost = ref(props.account?.smtpHost ?? "");
const smtpPort = ref(props.account?.smtpPort ?? 465);
const smtpSecurity = ref<ConnectionSecurity>(
  (props.account?.smtpSecurity as ConnectionSecurity) ?? "tls",
);

const isSubmitting = ref(false);
const error = ref<string | null>(null);

/**
 * Naive provider auto-detection from the email domain. Covers Gmail,
 * Outlook/Microsoft, iCloud, Yahoo. For unknown domains the user fills
 * in the host fields manually. Only in create mode — editing an email
 * must not silently overwrite existing host settings.
 */
const onEmailBlur = () => {
  if (isEdit.value) return;
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
    const input = {
      displayName: displayName.value || email.value,
      email: email.value,
      imapHost: imapHost.value,
      imapPort: imapPort.value,
      imapSecurity: imapSecurity.value,
      smtpHost: smtpHost.value || undefined,
      smtpPort: smtpPort.value,
      smtpSecurity: smtpSecurity.value,
    };
    if (props.account) {
      await accountsStore.updateAccountAsync(props.account.id, {
        ...input,
        password: password.value || undefined,
      });
    } else {
      await accountsStore.createAccountAsync({
        ...input,
        password: password.value,
      });
    }
    emit("saved");
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
  <form class="space-y-6" @submit.prevent="submitAsync">
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
        <UiInputPassword v-model="password" :required="!isEdit" />
        <p class="text-xs text-muted-foreground">
          <template v-if="isEdit">
            Leer lassen, um das gespeicherte Passwort zu behalten.
          </template>
          <template v-else>
            Bei Gmail/Outlook ein App-spezifisches Passwort verwenden.
          </template>
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
        <ShadcnSelect v-model="imapSecurity">
          <ShadcnSelectTrigger class="w-full">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="tls">TLS</ShadcnSelectItem>
            <ShadcnSelectItem value="startTls" disabled>STARTTLS (Phase 2)</ShadcnSelectItem>
            <ShadcnSelectItem value="none" disabled>Plain (Phase 2)</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        SMTP (Versand)
      </h2>
      <div class="grid grid-cols-[1fr_120px_140px] gap-3">
        <UiInput v-model="smtpHost" placeholder="smtp.example.com (optional)" />
        <UiInput v-model.number="smtpPort" type="number" placeholder="Port" />
        <ShadcnSelect v-model="smtpSecurity">
          <ShadcnSelectTrigger class="w-full">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="tls">TLS (465)</ShadcnSelectItem>
            <ShadcnSelectItem value="startTls">STARTTLS (587)</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </div>
    </section>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <div class="flex justify-end gap-2">
      <UiButton type="submit" :loading="isSubmitting">
        {{ isEdit ? "Änderungen speichern" : "Konto speichern" }}
      </UiButton>
    </div>
  </form>
</template>
