<script setup lang="ts">
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
</script>

<template>
  <ShadcnTabs default-value="import">
    <ShadcnTabsList class="w-full">
      <ShadcnTabsTrigger value="import" class="flex-1">
        {{ t("tabs.import") }}
      </ShadcnTabsTrigger>
      <ShadcnTabsTrigger value="new" class="flex-1">
        {{ t("tabs.new") }}
      </ShadcnTabsTrigger>
    </ShadcnTabsList>

    <ShadcnTabsContent value="import" class="pt-4">
      <AccountImportList @saved="emit('saved')" />
    </ShadcnTabsContent>

    <ShadcnTabsContent value="new" class="pt-4">
      <AccountForm @saved="emit('saved')" />
    </ShadcnTabsContent>
  </ShadcnTabs>
</template>

<i18n lang="yaml">
de:
  tabs:
    import: Vorhandene importieren
    new: Neues Konto
en:
  tabs:
    import: Import existing
    new: New account
</i18n>
