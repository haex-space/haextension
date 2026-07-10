<script setup lang="ts">
const emit = defineEmits<{ complete: [] }>();
</script>

<template>
  <div class="h-full overflow-y-auto p-8 grid place-items-center">
    <div class="w-full max-w-2xl space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl font-semibold">Mail-Konto einrichten</h1>
        <p class="text-sm text-muted-foreground">
          Dein Passwort wird im Passwort-Tresor von haex-vault gespeichert
          (Tag <code>haex-mail</code>).
        </p>
      </header>

      <AccountForm @saved="emit('complete')" />
    </div>
  </div>
</template>
