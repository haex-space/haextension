<script setup lang="ts">
import { MoreVertical, Trash2, Copy, Pencil } from "lucide-vue-next";
import type { SelectDrawing } from "~/database/schemas";

const props = defineProps<{
  drawing: SelectDrawing;
}>();

const emit = defineEmits<{
  open: [id: string];
  rename: [id: string, name: string];
  duplicate: [id: string];
  delete: [id: string];
}>();

const { t } = useI18n();

const formattedDate = computed(() => {
  const d = props.drawing.updatedAt ?? props.drawing.createdAt;
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});
</script>

<template>
  <div
    class="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg"
    @click="emit('open', drawing.id)"
  >
    <!-- Thumbnail -->
    <div class="aspect-[3/2] bg-white">
      <img
        v-if="drawing.thumbnail"
        :src="drawing.thumbnail"
        :alt="drawing.name"
        class="h-full w-full object-contain"
      />
      <div v-else class="flex h-full items-center justify-center text-muted-foreground/30">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M5 19 C7 15, 10 12, 12 14 C14 16, 17 9, 19 5" stroke-linecap="round" />
        </svg>
      </div>
    </div>

    <!-- Info -->
    <div class="flex items-center gap-1 border-t border-border px-3 py-2">
      <div class="min-w-0 flex-1">
        <input
          :value="drawing.name"
          class="h-6 w-full truncate rounded border border-transparent bg-transparent px-0.5 text-sm font-medium text-card-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none"
          @click.stop
          @change="emit('rename', drawing.id, ($event.target as HTMLInputElement).value)"
        />
        <p class="px-0.5 text-[10px] text-muted-foreground">{{ formattedDate }}</p>
      </div>

      <!-- Context Menu -->
      <ShadcnDropdownMenu>
        <ShadcnDropdownMenuTrigger as-child>
          <button
            class="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
            @click.stop
          >
            <MoreVertical class="size-4" />
          </button>
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="end">
          <ShadcnDropdownMenuItem @click.stop="emit('duplicate', drawing.id)">
            <Copy class="mr-2 size-4" /> {{ t("duplicate") }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuSeparator />
          <ShadcnDropdownMenuItem class="text-destructive" @click.stop="emit('delete', drawing.id)">
            <Trash2 class="mr-2 size-4" /> {{ t("delete") }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  duplicate: Duplizieren
  delete: Löschen
en:
  duplicate: Duplicate
  delete: Delete
</i18n>
