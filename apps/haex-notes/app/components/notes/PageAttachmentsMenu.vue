<script setup lang="ts">
import { File as FileIcon, FilePlus, Maximize2, PanelRightOpen, Paperclip, Trash2 } from "@lucide/vue";
import { addAttachment, isRemovable, removeAttachment } from "~/lib/attachments";
import { reportError } from "~/lib/errors";
import { formatBytes } from "~/lib/fileSize";
import type { PageAttachment } from "~/types/document";

/** Die Anhänge der offenen Seite: öffnen (neben der Seite oder im Vollbild), anhängen, entfernen (Spec 046, FR-023, FR-024). */
const { t, locale } = useI18n();
const notebook = useNotebookStore();
const viewer = useAttachmentViewerStore();
const assetStore = useAssetStore();

const attachments = computed(() => notebook.currentDoc?.attachments ?? []);

async function onFileAsync(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const assetId = await assetStore.putAsync(bytes, mimeType, file.name);
    const attachment: PageAttachment = {
      id: crypto.randomUUID(), kind: "file", assetId, name: file.name, mimeType, size: bytes.byteLength,
      addedAt: new Date().toISOString(),
    };
    notebook.applyEdit((doc) => addAttachment(doc, attachment, t("attach")));
    await notebook.saveCurrentPageAsync();
  } catch (error) {
    reportError(error);
  }
}

const remove = (attachment: PageAttachment) =>
  notebook.applyEdit((doc) => removeAttachment(doc, attachment.id, t("remove")));
</script>

<template>
  <ShadcnPopover>
    <ShadcnPopoverTrigger as-child>
      <button
        class="relative rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        :title="t('title')"
        :disabled="!notebook.currentDoc"
      >
        <Paperclip class="size-4" />
        <span
          v-if="attachments.length"
          class="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground"
        >{{ attachments.length }}</span>
      </button>
    </ShadcnPopoverTrigger>
    <ShadcnPopoverContent align="end" class="w-80 p-2">
      <div class="mb-1 px-1 text-xs font-medium text-muted-foreground">{{ t('title') }}</div>
      <p v-if="!attachments.length" class="px-1 py-2 text-sm text-muted-foreground">{{ t('none') }}</p>
      <ul v-else class="space-y-1">
        <li v-for="attachment in attachments" :key="attachment.id" class="flex items-center gap-1 rounded px-1 py-1 hover:bg-accent/50">
          <FileIcon class="size-4 shrink-0 text-muted-foreground" />
          <button class="min-w-0 flex-1 text-left" :title="t('beside')" @click="viewer.show(attachment.id, 'side')">
            <div class="truncate text-sm">{{ attachment.kind === 'original' ? t('original') : attachment.name }}</div>
            <div class="truncate text-xs text-muted-foreground">
              <template v-if="attachment.kind === 'original'">{{ attachment.name }} · </template>
              {{ attachment.size !== undefined ? formatBytes(attachment.size, locale) : attachment.mimeType }}
            </div>
          </button>
          <button class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" :title="t('beside')" @click="viewer.show(attachment.id, 'side')">
            <PanelRightOpen class="size-4" />
          </button>
          <button class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" :title="t('fullscreen')" @click="viewer.show(attachment.id, 'full')">
            <Maximize2 class="size-4" />
          </button>
          <button
            v-if="isRemovable(attachment)"
            class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
            :title="t('remove')"
            @click="remove(attachment)"
          >
            <Trash2 class="size-4" />
          </button>
        </li>
      </ul>
      <label class="mt-2 flex cursor-pointer items-center gap-2 rounded border border-border px-2 py-1.5 text-sm hover:bg-accent">
        <FilePlus class="size-4" />{{ t('attach') }}
        <input class="sr-only" type="file" @change="onFileAsync">
      </label>
    </ShadcnPopoverContent>
  </ShadcnPopover>
</template>

<i18n lang="yaml">
de:
  title: Anhänge der Seite
  none: Keine Anhänge.
  original: Original
  beside: Neben der Seite öffnen
  fullscreen: Im Vollbild öffnen – nur der Anhang ist zu sehen
  remove: Anhang entfernen
  attach: Datei anhängen
en:
  title: Attachments of the page
  none: No attachments.
  original: Original
  beside: Open beside the page
  fullscreen: Open in full screen – only the attachment is shown
  remove: Remove attachment
  attach: Attach a file
</i18n>
