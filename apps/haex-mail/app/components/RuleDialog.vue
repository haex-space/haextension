<script setup lang="ts">
import { Minus, Plus } from "@lucide/vue";
import { toast } from "vue-sonner";
import { MAILBOX_ROLES } from "~/database/schemas";
import type * as schema from "~/database/schemas";
import { decodeMailboxName } from "~/lib/imap";
import { roleLabelKey } from "~/lib/mail";
import {
  MAX_CONDITIONS,
  RuleValidationError,
  type RuleAccount,
  type RuleAction,
  type RuleCondition,
  type RuleDef,
} from "~/lib/rules";
import { getErrorMessage } from "~/lib/utils";

/**
 * Create or edit a mail rule: name, account, conditions (all must hold), actions, and whether to run
 * the rule once on the existing INBOX messages. A rule that fails the checks of `lib/rules.ts` is
 * shown with a message per problem. For "all accounts" a move can only name a role, because folder
 * names differ per account.
 */
const props = defineProps<{ rule?: RuleDef }>();
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const accountsStore = useAccountsStore();
const rulesStore = useRulesStore();
const mailStore = useMailStore();

const ALL = "__all__";
const NO_MOVE = "__none__";

const name = ref(props.rule?.name ?? "");
const accountId = ref(props.rule?.accountId ?? ALL);

type Row = { field: "from" | "to" | "subject" | "attachment"; contains: string };
const rows = ref<Row[]>(
  props.rule?.conditions.map((c) => ({
    field: c.field,
    contains: "contains" in c ? c.contains : "",
  })) ?? [{ field: "from", contains: "" }],
);

const existingMove = props.rule?.actions.find((a) => a.type === "move");
// "role:archive" for a role, "box:Name" for a folder of one account.
const moveTarget = ref(
  !existingMove
    ? NO_MOVE
    : "role" in existingMove
      ? `role:${existingMove.role}`
      : `box:${existingMove.mailbox}`,
);
const markRead = ref(props.rule?.actions.some((a) => a.type === "markRead") ?? false);
const flag = ref(props.rule?.actions.some((a) => a.type === "flag") ?? false);
const applyToExisting = ref(false);

const ruleAccounts = ref<RuleAccount[]>([]);
onMounted(async () => {
  ruleAccounts.value = await rulesStore.loadRuleAccountsAsync();
});

// The folders of one account; for all accounts only roles are on offer.
const folderOptions = computed(() =>
  accountId.value === ALL
    ? []
    : (ruleAccounts.value.find((a) => a.id === accountId.value)?.mailboxes ?? []).filter(
        (m) => m.role === null,
      ),
);
// A folder picked for one account cannot stay when the choice goes back to "all accounts".
watch(accountId, (id) => {
  if (id === ALL && moveTarget.value.startsWith("box:")) moveTarget.value = NO_MOVE;
});

const addRow = () => {
  if (rows.value.length < MAX_CONDITIONS) rows.value.push({ field: "from", contains: "" });
};
const removeRow = (index: number) => {
  rows.value.splice(index, 1);
};

const issues = ref<string[]>([]);
const error = ref<string | null>(null);
const isSaving = ref(false);

const buildInput = () => {
  const conditions: RuleCondition[] = rows.value.map((r) =>
    r.field === "attachment" ? { field: "attachment" } : { field: r.field, contains: r.contains },
  );
  const actions: RuleAction[] = [];
  if (moveTarget.value.startsWith("role:")) {
    actions.push({ type: "move", role: moveTarget.value.slice(5) as schema.MailboxRole });
  } else if (moveTarget.value.startsWith("box:")) {
    actions.push({ type: "move", mailbox: moveTarget.value.slice(4) });
  }
  if (markRead.value) actions.push({ type: "markRead" });
  if (flag.value) actions.push({ type: "flag" });
  return {
    name: name.value,
    accountId: accountId.value === ALL ? null : accountId.value,
    enabled: props.rule?.enabled ?? true,
    conditions,
    actions,
  };
};

const saveAsync = async () => {
  issues.value = [];
  error.value = null;
  isSaving.value = true;
  try {
    const id = await rulesStore.saveRuleAsync(buildInput(), { id: props.rule?.id });
    const saved = rulesStore.rules.find((r) => r.id === id);
    if (applyToExisting.value && saved) {
      // The rule is stored by now; a failing run must not read as a failed save.
      try {
        const { applied, limited } = await mailStore.applyRuleToExistingAsync(saved);
        toast.success(t(limited ? "appliedLimited" : "applied", { count: applied }));
      } catch (applyErr) {
        toast.error(getErrorMessage(applyErr));
      }
    }
    emit("saved");
  } catch (err) {
    if (err instanceof RuleValidationError) {
      issues.value = [...new Set(err.issues.map((i) => i.code))];
    } else {
      error.value = getErrorMessage(err);
    }
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <form class="space-y-6" @submit.prevent="saveAsync">
    <section class="space-y-3">
      <label class="block space-y-1">
        <span class="text-sm">{{ t("name") }}</span>
        <UiInput v-model="name" :placeholder="t('namePlaceholder')" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm">{{ t("account") }}</span>
        <ShadcnSelect v-model="accountId">
          <ShadcnSelectTrigger class="w-full" :aria-label="t('account')">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem :value="ALL">{{ t("allAccounts") }}</ShadcnSelectItem>
            <ShadcnSelectItem
              v-for="account in accountsStore.accounts"
              :key="account.id"
              :value="account.id"
            >
              {{ account.displayName }}
            </ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </label>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {{ t("conditions") }}
      </h2>
      <p class="text-xs text-muted-foreground">{{ t("conditionsHint") }}</p>
      <div v-for="(row, index) in rows" :key="index" class="flex items-center gap-2">
        <ShadcnSelect v-model="row.field">
          <ShadcnSelectTrigger class="w-40 shrink-0" :aria-label="t('conditionField')">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="from">{{ t("field.from") }}</ShadcnSelectItem>
            <ShadcnSelectItem value="to">{{ t("field.to") }}</ShadcnSelectItem>
            <ShadcnSelectItem value="subject">{{ t("field.subject") }}</ShadcnSelectItem>
            <ShadcnSelectItem value="attachment">{{ t("field.attachment") }}</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
        <UiInput
          v-if="row.field !== 'attachment'"
          v-model="row.contains"
          class="flex-1"
          :placeholder="t('containsPlaceholder')"
        />
        <span v-else class="flex-1 text-sm text-muted-foreground">{{ t("hasAttachment") }}</span>
        <UiButton
          type="button"
          variant="ghost"
          size="icon-lg"
          :icon="Minus"
          :disabled="rows.length === 1"
          :aria-label="t('removeCondition')"
          @click="removeRow(index)"
        />
      </div>
      <UiButton
        type="button"
        variant="secondary"
        :prepend-icon="Plus"
        :disabled="rows.length >= MAX_CONDITIONS"
        @click="addRow"
      >
        {{ t("addCondition") }}
      </UiButton>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {{ t("actions") }}
      </h2>
      <label class="block space-y-1">
        <span class="text-sm">{{ t("moveTo") }}</span>
        <ShadcnSelect v-model="moveTarget">
          <ShadcnSelectTrigger class="w-full" :aria-label="t('moveTo')">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem :value="NO_MOVE">{{ t("noMove") }}</ShadcnSelectItem>
            <ShadcnSelectItem
              v-for="role in MAILBOX_ROLES.filter((r) => r !== 'inbox')"
              :key="role"
              :value="`role:${role}`"
            >
              {{ t(roleLabelKey(role)!) }}
            </ShadcnSelectItem>
            <ShadcnSelectItem
              v-for="folder in folderOptions"
              :key="folder.name"
              :value="`box:${folder.name}`"
            >
              {{ decodeMailboxName(folder.name) }}
            </ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
        <p v-if="accountId === ALL" class="text-xs text-muted-foreground">
          {{ t("foldersNeedAccount") }}
        </p>
      </label>
      <label class="flex items-center gap-3">
        <ShadcnCheckbox v-model="markRead" class="border-muted-foreground/50" />
        <span class="text-sm">{{ t("markRead") }}</span>
      </label>
      <label class="flex items-center gap-3">
        <ShadcnCheckbox v-model="flag" class="border-muted-foreground/50" />
        <span class="text-sm">{{ t("flag") }}</span>
      </label>
    </section>

    <label class="flex items-start gap-3">
      <ShadcnCheckbox v-model="applyToExisting" class="mt-0.5 border-muted-foreground/50" />
      <span class="text-sm">
        {{ t("applyToExisting") }}
        <span class="block text-xs text-muted-foreground">{{ t("applyToExistingHint") }}</span>
      </span>
    </label>

    <ul v-if="issues.length > 0" class="space-y-1 text-sm text-destructive">
      <li v-for="code in issues" :key="code">{{ t(`errors.${code}`) }}</li>
    </ul>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <div class="flex justify-end">
      <UiButton type="submit" size="lg" :loading="isSaving">{{ t("save") }}</UiButton>
    </div>
  </form>
</template>

<i18n lang="yaml">
de:
  name: Name
  namePlaceholder: z. B. Newsletter ins Archiv
  account: Konto
  allAccounts: Alle Konten
  conditions: Bedingungen
  conditionsHint: Die Regel greift, wenn alle Bedingungen zutreffen.
  conditionField: Feld
  field:
    from: Absender enthält
    to: Empfänger enthält
    subject: Betreff enthält
    attachment: Anhang
  containsPlaceholder: Text
  hasAttachment: Die Mail hat einen Anhang
  addCondition: Bedingung hinzufügen
  removeCondition: Bedingung entfernen
  actions: Aktionen
  moveTo: Verschieben nach
  noMove: Nicht verschieben
  foldersNeedAccount: Eigene Ordner stehen nur zur Wahl, wenn die Regel für ein Konto gilt.
  markRead: Als gelesen markieren
  flag: Markieren
  applyToExisting: Auf vorhandene Mails in INBOX anwenden
  applyToExistingHint: Einmalig auf die neuesten 1000 Mails des Posteingangs.
  applied: "{count} Mails geändert"
  appliedLimited: "{count} Mails geändert (nur die neuesten 1000 des Posteingangs wurden geprüft)"
  save: Speichern
  errors:
    nameRequired: Die Regel braucht einen Namen.
    nameTooLong: Der Name ist zu lang (höchstens 80 Zeichen).
    unknownAccount: Das Konto gibt es nicht mehr.
    conditionsRequired: Die Regel braucht mindestens eine Bedingung.
    tooManyConditions: Zu viele Bedingungen (höchstens 8).
    conditionTextRequired: Jede Bedingung mit Text braucht einen Text.
    conditionTextTooLong: Ein Bedingungstext ist zu lang (höchstens 200 Zeichen).
    actionsRequired: Die Regel braucht mindestens eine Aktion.
    tooManyActions: Zu viele Aktionen (höchstens 4).
    duplicateAction: Jede Aktion darf nur einmal vorkommen.
    moveTargetRequired: Der Zielordner fehlt.
    moveMailboxNeedsAccount: Ein eigener Ordner geht nur bei einer Regel für ein einzelnes Konto.
en:
  name: Name
  namePlaceholder: e.g. Newsletters to archive
  account: Account
  allAccounts: All accounts
  conditions: Conditions
  conditionsHint: The rule applies when all conditions are met.
  conditionField: Field
  field:
    from: Sender contains
    to: Recipient contains
    subject: Subject contains
    attachment: Attachment
  containsPlaceholder: Text
  hasAttachment: The mail has an attachment
  addCondition: Add condition
  removeCondition: Remove condition
  actions: Actions
  moveTo: Move to
  noMove: Do not move
  foldersNeedAccount: Your own folders can only be chosen when the rule is for one account.
  markRead: Mark as read
  flag: Flag
  applyToExisting: Apply to existing mails in INBOX
  applyToExistingHint: Once, on the newest 1000 mails of the inbox.
  applied: "{count} mails changed"
  appliedLimited: "{count} mails changed (only the newest 1000 of the inbox were checked)"
  save: Save
  errors:
    nameRequired: The rule needs a name.
    nameTooLong: The name is too long (at most 80 characters).
    unknownAccount: That account no longer exists.
    conditionsRequired: The rule needs at least one condition.
    tooManyConditions: Too many conditions (at most 8).
    conditionTextRequired: Every condition with text needs a text.
    conditionTextTooLong: A condition text is too long (at most 200 characters).
    actionsRequired: The rule needs at least one action.
    tooManyActions: Too many actions (at most 4).
    duplicateAction: Each action may appear once.
    moveTargetRequired: The target folder is missing.
    moveMailboxNeedsAccount: Your own folder only works for a rule on a single account.
</i18n>
