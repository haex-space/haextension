<script setup lang="ts">
const emit = defineEmits<{
  close: [];
  connect: [host: string, port: number, username: string];
}>();

const host = ref("localhost");
const port = ref(22);
const username = ref("");

const onSubmit = () => {
  if (!host.value || !username.value) return;
  emit("connect", host.value, port.value, username.value);
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="w-80 rounded-lg border border-border bg-background p-4 shadow-lg">
      <h3 class="mb-3 text-sm font-semibold">SSH</h3>

      <div class="space-y-2">
        <div>
          <label class="mb-1 block text-xs text-muted-foreground">Host</label>
          <input
            v-model="host"
            class="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            placeholder="localhost"
            @keydown.enter="onSubmit"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-muted-foreground">Port</label>
          <input
            v-model.number="port"
            type="number"
            class="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            @keydown.enter="onSubmit"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-muted-foreground">User</label>
          <input
            v-model="username"
            class="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            placeholder="root"
            @keydown.enter="onSubmit"
          />
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button
          class="rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          @click="emit('close')"
        >
          Abbrechen
        </button>
        <button
          class="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          :disabled="!host || !username"
          @click="onSubmit"
        >
          Verbinden
        </button>
      </div>
    </div>
  </div>
</template>
