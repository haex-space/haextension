<template>
  <!-- Sync Direction (only in edit mode) -->
  <div v-if="showDirection" class="space-y-2">
    <ShadcnLabel>{{ t("direction.label") }}</ShadcnLabel>
    <ShadcnSelect v-model="direction">
      <ShadcnSelectTrigger>
        <ShadcnSelectValue />
      </ShadcnSelectTrigger>
      <ShadcnSelectContent>
        <ShadcnSelectItem value="up">
          <span class="flex items-center gap-2">
            <Upload class="size-4" />
            {{ t("direction.up") }}
          </span>
        </ShadcnSelectItem>
        <ShadcnSelectItem value="down">
          <span class="flex items-center gap-2">
            <Download class="size-4" />
            {{ t("direction.down") }}
          </span>
        </ShadcnSelectItem>
        <ShadcnSelectItem value="both">
          <span class="flex items-center gap-2">
            <RefreshCw class="size-4" />
            {{ t("direction.both") }}
          </span>
        </ShadcnSelectItem>
      </ShadcnSelectContent>
    </ShadcnSelect>
  </div>

  <!-- Conflict Strategy -->
  <div class="space-y-2">
    <ShadcnLabel>{{ t("conflict.label") }}</ShadcnLabel>
    <ShadcnSelect v-model="conflictStrategy">
      <ShadcnSelectTrigger>
        <ShadcnSelectValue />
      </ShadcnSelectTrigger>
      <ShadcnSelectContent>
        <ShadcnSelectItem value="ask">
          <span class="flex items-center gap-2">
            <AlertCircle class="size-4" />
            {{ t("conflict.ask") }}
          </span>
        </ShadcnSelectItem>
        <ShadcnSelectItem value="newer">
          <span class="flex items-center gap-2">
            <Clock class="size-4" />
            {{ t("conflict.newer") }}
          </span>
        </ShadcnSelectItem>
        <ShadcnSelectItem value="local">
          <span class="flex items-center gap-2">
            <User class="size-4" />
            {{ t("conflict.local") }}
          </span>
        </ShadcnSelectItem>
        <ShadcnSelectItem value="remote">
          <span class="flex items-center gap-2">
            <HardDrive class="size-4" />
            {{ t("conflict.remote") }}
          </span>
        </ShadcnSelectItem>
        <ShadcnSelectItem value="keepBoth">
          <span class="flex items-center gap-2">
            <Copy class="size-4" />
            {{ t("conflict.keepBoth") }}
          </span>
        </ShadcnSelectItem>
      </ShadcnSelectContent>
    </ShadcnSelect>
    <p class="text-xs text-muted-foreground">
      {{ t("conflict.hint") }}
    </p>
  </div>

  <!-- Ignore Patterns -->
  <div class="space-y-2">
    <ShadcnLabel>{{ t("ignore.label") }}</ShadcnLabel>
    <ShadcnTextarea
      v-model="ignorePatterns"
      :placeholder="t('ignore.placeholder')"
      rows="4"
      class="font-mono text-sm"
    />
    <p class="text-xs text-muted-foreground">
      {{ t("ignore.hint") }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { Upload, Download, RefreshCw, AlertCircle, Clock, User, HardDrive, Copy } from "@lucide/vue";
import type { SyncDirection, ConflictStrategy } from "~/stores/syncRules";

defineProps<{
  showDirection: boolean;
}>();

const direction = defineModel<SyncDirection>("direction", { required: true });
const conflictStrategy = defineModel<ConflictStrategy>("conflictStrategy", { required: true });
const ignorePatterns = defineModel<string>("ignorePatterns", { required: true });

const { t } = useI18n();
</script>

<i18n lang="yaml">
de:
  direction:
    label: Sync-Richtung
    up: Nur hochladen (Lokal → Cloud)
    down: Nur herunterladen (Cloud → Lokal)
    both: Bidirektional (Beide Richtungen)
  conflict:
    label: Konflikt-Strategie
    ask: Nachfragen
    newer: Neuere Version verwenden
    local: Lokale Version bevorzugen
    remote: Remote-Version bevorzugen
    keepBoth: Beide Versionen behalten
    hint: Wie sollen Konflikte bei gleichzeitigen Änderungen behandelt werden?
  ignore:
    label: Ignorierte Dateien
    placeholder: |
      node_modules/
      .git/
      *.log
      .DS_Store
    hint: Ein Pattern pro Zeile. Unterstützt Gitignore-Syntax.

en:
  direction:
    label: Sync Direction
    up: Upload only (Local → Cloud)
    down: Download only (Cloud → Local)
    both: Bidirectional (Both ways)
  conflict:
    label: Conflict Strategy
    ask: Ask me
    newer: Use newer version
    local: Prefer local version
    remote: Prefer remote version
    keepBoth: Keep both versions
    hint: How should conflicts be resolved when both versions have changed?
  ignore:
    label: Ignored Files
    placeholder: |
      node_modules/
      .git/
      *.log
      .DS_Store
    hint: One pattern per line. Supports gitignore syntax.
</i18n>
