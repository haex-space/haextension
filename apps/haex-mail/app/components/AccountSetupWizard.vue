<script setup lang="ts">
const emit = defineEmits<{ complete: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="h-full overflow-y-auto p-8 grid place-items-center">
    <div class="w-full max-w-2xl space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>
        <p class="text-sm text-muted-foreground">
          <i18n-t keypath="description">
            <template #tag>
              <code>haex-mail</code>
            </template>
          </i18n-t>
        </p>
      </header>

      <AccountForm @saved="emit('complete')" />
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Mail-Konto einrichten
  description: Dein Passwort wird im Passwort-Tresor von haex-vault gespeichert (Tag {tag}).
en:
  title: Set up mail account
  description: Your password is stored in the haex-vault password store (tag {tag}).
</i18n>
