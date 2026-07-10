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

const { t } = useI18n();
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

// --- Connection test ---
interface TestResult {
  status: "success" | "error" | "info";
  message: string;
}

const isTesting = ref(false);
const imapTestResult = ref<TestResult | null>(null);
const smtpTestResult = ref<TestResult | null>(null);

// Any change to connection-relevant fields invalidates the last result.
watch(
  [email, password, imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity],
  () => {
    imapTestResult.value = null;
    smtpTestResult.value = null;
  },
);

const testResultClass = (result: TestResult) => {
  switch (result.status) {
    case "success":
      return "text-green-600 dark:text-green-500";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
};

const testConnectionAsync = async () => {
  imapTestResult.value = null;
  smtpTestResult.value = null;
  isTesting.value = true;
  try {
    const base = {
      email: email.value,
      password: password.value,
      accountId: props.account?.id,
      imapHost: imapHost.value,
      imapPort: imapPort.value,
      imapSecurity: imapSecurity.value,
    };

    let inboxName: string | null = null;
    let trashName: string | null = null;
    try {
      const res = await accountsStore.testImapConnectionAsync(base);
      inboxName = res.inboxName;
      trashName = res.trashName;
      imapTestResult.value = {
        status: "success",
        message: t(
          "test.imapSuccess",
          { count: res.mailboxCount },
          res.mailboxCount,
        ),
      };
    } catch (err) {
      imapTestResult.value = {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      return;
    }

    if (!smtpHost.value) {
      smtpTestResult.value = {
        status: "info",
        message: t("test.smtpSkipped"),
      };
      return;
    }

    try {
      const res = await accountsStore.testSmtpRoundtripAsync({
        ...base,
        smtpHost: smtpHost.value,
        smtpPort: smtpPort.value,
        smtpSecurity: smtpSecurity.value,
        inboxName,
        trashName,
      });
      smtpTestResult.value = {
        status: "success",
        message: res.cleanedUp ? t("test.smtpCleaned") : t("test.smtpSent"),
      };
    } catch (err) {
      smtpTestResult.value = {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  } finally {
    isTesting.value = false;
  }
};

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
        {{ t("sections.account") }}
      </h2>
      <label class="block space-y-1">
        <span class="text-sm">{{ t("displayName") }}</span>
        <UiInput v-model="displayName" :placeholder="t('displayNamePlaceholder')" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm">{{ t("email") }}</span>
        <UiInput
          v-model="email"
          type="email"
          placeholder="name@example.com"
          required
          @blur="onEmailBlur"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm">{{ t("password") }}</span>
        <UiInputPassword v-model="password" :required="!isEdit" />
        <p class="text-xs text-muted-foreground">
          {{ isEdit ? t("passwordHintEdit") : t("passwordHintCreate") }}
        </p>
      </label>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {{ t("sections.imap") }}
      </h2>
      <div class="grid grid-cols-[1fr_120px_140px] gap-3">
        <UiInput v-model="imapHost" placeholder="imap.example.com" required />
        <UiInput v-model.number="imapPort" type="number" placeholder="Port" required />
        <ShadcnSelect v-model="imapSecurity">
          <ShadcnSelectTrigger class="w-full" :aria-label="t('imapSecurity')">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="tls">TLS</ShadcnSelectItem>
            <ShadcnSelectItem value="startTls" disabled>{{ t("securityPhase2", { protocol: "STARTTLS" }) }}</ShadcnSelectItem>
            <ShadcnSelectItem value="none" disabled>{{ t("securityPhase2", { protocol: "Plain" }) }}</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {{ t("sections.smtp") }}
      </h2>
      <div class="grid grid-cols-[1fr_120px_140px] gap-3">
        <UiInput v-model="smtpHost" :placeholder="t('smtpHostPlaceholder')" />
        <UiInput v-model.number="smtpPort" type="number" placeholder="Port" />
        <ShadcnSelect v-model="smtpSecurity">
          <ShadcnSelectTrigger class="w-full" :aria-label="t('smtpSecurity')">
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

    <div v-if="imapTestResult || smtpTestResult" class="space-y-1 text-sm">
      <p v-if="imapTestResult" :class="testResultClass(imapTestResult)">
        IMAP: {{ imapTestResult.message }}
      </p>
      <p v-if="smtpTestResult" :class="testResultClass(smtpTestResult)">
        SMTP: {{ smtpTestResult.message }}
      </p>
    </div>

    <div class="flex justify-end gap-2">
      <UiButton
        type="button"
        variant="outline"
        size="lg"
        :loading="isTesting"
        :disabled="isSubmitting"
        @click="testConnectionAsync"
      >
        {{ t("testConnection") }}
      </UiButton>
      <UiButton type="submit" size="lg" :loading="isSubmitting" :disabled="isTesting">
        {{ isEdit ? t("saveChanges") : t("saveAccount") }}
      </UiButton>
    </div>
  </form>
</template>

<i18n lang="yaml">
de:
  sections:
    account: Konto
    imap: IMAP (Empfang)
    smtp: SMTP (Versand)
  displayName: Anzeigename
  displayNamePlaceholder: z.B. Privates Gmail
  email: E-Mail
  password: Passwort (oder App-Password)
  passwordHintEdit: Leer lassen, um das gespeicherte Passwort zu behalten.
  passwordHintCreate: Bei Gmail/Outlook ein App-spezifisches Passwort verwenden.
  imapSecurity: IMAP-Sicherheit
  smtpSecurity: SMTP-Sicherheit
  smtpHostPlaceholder: smtp.example.com (optional)
  securityPhase2: "{protocol} (Phase 2)"
  testConnection: Verbindung testen
  saveChanges: Änderungen speichern
  saveAccount: Konto speichern
  test:
    imapSuccess: Verbindung erfolgreich ({count} Postfach) | Verbindung erfolgreich ({count} Postfächer)
    smtpSkipped: nicht konfiguriert – übersprungen
    smtpCleaned: Test-Mail gesendet und in den Papierkorb verschoben
    smtpSent: Test-Mail gesendet (Aufräumen nicht bestätigt)
en:
  sections:
    account: Account
    imap: IMAP (incoming)
    smtp: SMTP (outgoing)
  displayName: Display name
  displayNamePlaceholder: e.g. Personal Gmail
  email: Email
  password: Password (or app password)
  passwordHintEdit: Leave empty to keep the stored password.
  passwordHintCreate: For Gmail/Outlook use an app-specific password.
  imapSecurity: IMAP security
  smtpSecurity: SMTP security
  smtpHostPlaceholder: smtp.example.com (optional)
  securityPhase2: "{protocol} (phase 2)"
  testConnection: Test connection
  saveChanges: Save changes
  saveAccount: Save account
  test:
    imapSuccess: Connection successful ({count} mailbox) | Connection successful ({count} mailboxes)
    smtpSkipped: not configured – skipped
    smtpCleaned: Test mail sent and moved to trash
    smtpSent: Test mail sent (cleanup not confirmed)
</i18n>
