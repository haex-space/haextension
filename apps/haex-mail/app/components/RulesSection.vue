<script setup lang="ts">
import { Pencil, Plus, Trash2 } from "@lucide/vue";
import { roleLabelKey } from "~/lib/mail";
import {
  describeRule,
  ruleTargetMissing,
  type ActionPart,
  type ConditionPart,
  type RuleAccount,
  type RuleDef,
} from "~/lib/rules";

/**
 * The "Rules" part of the settings: the list of mail rules with an on/off switch, edit and delete,
 * the dialog to create or change one, and the confirmation before a rule goes. Follows the accounts
 * section above it.
 */
const { t } = useI18n();
const rulesStore = useRulesStore();
const accountsStore = useAccountsStore();

const ruleAccounts = ref<RuleAccount[]>([]);
const reloadAsync = async () => {
  await rulesStore.loadRulesAsync();
  ruleAccounts.value = await rulesStore.loadRuleAccountsAsync();
};
onMounted(reloadAsync);

// An account whose mailboxes were never fetched is unknown, not missing a folder.
const knownAccounts = computed(() => ruleAccounts.value.filter((a) => a.mailboxes.length > 0));
const targetMissing = (rule: RuleDef) => {
  const covered =
    rule.accountId === null
      ? knownAccounts.value
      : knownAccounts.value.filter((a) => a.id === rule.accountId);
  return covered.length > 0 && ruleTargetMissing(rule, covered);
};

const roleText = (role: string) => {
  const key = roleLabelKey(role);
  return key ? t(key) : role;
};
const conditionText = (part: ConditionPart) =>
  part.key === "attachment" ? t("part.attachment") : t(`part.${part.key}`, { text: part.text });
const actionText = (part: ActionPart) => {
  if (part.key === "moveRole") return t("part.moveRole", { target: roleText(part.target) });
  if (part.key === "moveMailbox") return t("part.moveMailbox", { target: part.target });
  return t(`part.${part.key}`);
};
const summary = (rule: RuleDef) => {
  const { conditions, actions } = describeRule(rule);
  return t("summary", {
    conditions: conditions.map(conditionText).join(t("and")),
    actions: actions.map(actionText).join(", "),
  });
};
const accountName = (rule: RuleDef) =>
  rule.accountId === null
    ? t("allAccounts")
    : (accountsStore.accounts.find((a) => a.id === rule.accountId)?.displayName ?? "");

// --- Add / edit dialog ---
const showDialog = ref(false);
const editRule = ref<RuleDef | undefined>();
const openCreate = () => {
  editRule.value = undefined;
  showDialog.value = true;
};
const openEdit = (rule: RuleDef) => {
  editRule.value = rule;
  showDialog.value = true;
};
const onSaved = async () => {
  showDialog.value = false;
  editRule.value = undefined;
  await reloadAsync();
};

// --- Delete confirmation ---
const showDeleteConfirm = ref(false);
const deleteRuleId = ref<string | null>(null);
const confirmDelete = (id: string) => {
  deleteRuleId.value = id;
  showDeleteConfirm.value = true;
};
const executeDeleteAsync = async () => {
  if (!deleteRuleId.value) return;
  await rulesStore.deleteRuleAsync(deleteRuleId.value);
  deleteRuleId.value = null;
  showDeleteConfirm.value = false;
};
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
      {{ t("title") }}
    </h2>

    <div
      v-for="rule in rulesStore.rules"
      :key="rule.id"
      class="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted"
    >
      <div class="flex-1 min-w-0 space-y-0.5">
        <p class="text-sm font-medium truncate">{{ rule.name }}</p>
        <p class="text-xs text-muted-foreground">{{ summary(rule) }}</p>
        <p class="text-xs text-muted-foreground truncate">{{ accountName(rule) }}</p>
        <div class="flex flex-wrap gap-2 pt-0.5">
          <span
            v-if="rule.origin === 'agent'"
            class="rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground"
          >
            {{ t("byAgent") }}
          </span>
          <span
            v-if="targetMissing(rule)"
            class="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive"
          >
            {{ t("targetMissing") }}
          </span>
        </div>
      </div>
      <ShadcnSwitch
        class="mt-1 shrink-0"
        :model-value="rule.enabled"
        :aria-label="t('enabled')"
        @update:model-value="(on: boolean) => rulesStore.setEnabledAsync(rule.id, on)"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Pencil"
        class="shrink-0 hover:bg-background"
        :tooltip="t('edit')"
        :aria-label="t('edit')"
        @click="openEdit(rule)"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Trash2"
        class="shrink-0 text-destructive hover:bg-background"
        :tooltip="t('delete')"
        :aria-label="t('delete')"
        @click="confirmDelete(rule.id)"
      />
    </div>

    <p v-if="rulesStore.rules.length === 0" class="text-sm text-muted-foreground">
      {{ t("empty") }}
    </p>

    <UiButton variant="secondary" size="lg" class="w-full" :prepend-icon="Plus" @click="openCreate">
      {{ t("add") }}
    </UiButton>

    <UiDrawerModal
      v-model:open="showDialog"
      :title="editRule ? t('editTitle') : t('addTitle')"
      content-class="max-w-2xl"
    >
      <template #content>
        <div class="p-4">
          <RuleDialog :key="editRule?.id ?? 'new'" :rule="editRule" @saved="onSaved" />
        </div>
      </template>
    </UiDrawerModal>

    <UiDrawerModal v-model:open="showDeleteConfirm" :title="t('deleteConfirm.title')">
      <template #content>
        <div class="p-4">
          <p class="text-sm text-muted-foreground">{{ t("deleteConfirm.description") }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UiButton variant="ghost" size="lg" @click="showDeleteConfirm = false">
            {{ t("deleteConfirm.abort") }}
          </UiButton>
          <UiButton variant="destructive" size="lg" @click="executeDeleteAsync">
            {{ t("deleteConfirm.confirm") }}
          </UiButton>
        </div>
      </template>
    </UiDrawerModal>
  </section>
</template>

<i18n lang="yaml">
de:
  title: Regeln
  empty: Noch keine Regeln angelegt.
  add: Regel hinzufügen
  addTitle: Neue Regel
  editTitle: Regel bearbeiten
  edit: Regel bearbeiten
  delete: Regel löschen
  enabled: Regel aktiv
  allAccounts: Alle Konten
  byAgent: vom Agenten angelegt
  targetMissing: Zielordner fehlt
  and: " und "
  summary: "Wenn {conditions}: {actions}"
  part:
    from: Absender „{text}“ enthält
    to: Empfänger „{text}“ enthält
    subject: Betreff „{text}“ enthält
    attachment: ein Anhang da ist
    moveRole: in {target} verschieben
    moveMailbox: in den Ordner „{target}“ verschieben
    markRead: als gelesen markieren
    flag: markieren
  deleteConfirm:
    title: Regel löschen?
    description: Die Regel wird entfernt. Mails, die sie schon einsortiert hat, bleiben dort.
    abort: Abbrechen
    confirm: Löschen
en:
  title: Rules
  empty: No rules yet.
  add: Add rule
  addTitle: New rule
  editTitle: Edit rule
  edit: Edit rule
  delete: Delete rule
  enabled: Rule on
  allAccounts: All accounts
  byAgent: created by the agent
  targetMissing: Target folder missing
  and: " and "
  summary: "If {conditions}: {actions}"
  part:
    from: sender contains “{text}”
    to: recipient contains “{text}”
    subject: subject contains “{text}”
    attachment: it has an attachment
    moveRole: move to {target}
    moveMailbox: move to the folder “{target}”
    markRead: mark as read
    flag: flag
  deleteConfirm:
    title: Delete rule?
    description: The rule is removed. Mails it already sorted stay where they are.
    abort: Cancel
    confirm: Delete
</i18n>
