<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')" :description="t('description')">
    <template #content>
      <div class="space-y-4 p-4">
        <div v-if="!photo" class="flex flex-wrap gap-2">
          <label class="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
            <Camera class="mr-1 inline size-4" />{{ t('takePhoto') }}
            <input class="sr-only" type="file" accept="image/*" capture="environment" @change="onFileAsync">
          </label>
          <label class="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
            <ImageUp class="mr-1 inline size-4" />{{ t('chooseFile') }}
            <input class="sr-only" type="file" accept="image/*" @change="onFileAsync">
          </label>
        </div>

        <template v-else>
          <div class="flex h-64 items-center justify-center overflow-hidden rounded-lg bg-muted">
            <img
:src="previewUrl" :alt="t('preview')" class="max-h-56 max-w-56 object-contain transition-transform"
              :style="{ transform: `rotate(${rotation}deg)` }">
          </div>
          <div class="flex items-center justify-center gap-2">
            <button
class="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30" :title="t('turnLeft')"
              :disabled="reading" @click="turn(270)">
              <RotateCcw class="size-4" />
            </button>
            <button
class="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30" :title="t('turnRight')"
              :disabled="reading" @click="turn(90)">
              <RotateCw class="size-4" />
            </button>
          </div>
          <p v-if="hints.length" class="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            {{ hints.map((hint) => t(`quality.${hint}`)).join(' ') }} {{ t('quality.retake') }}
          </p>
        </template>

        <p v-if="reading" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />{{ t('reading') }}
        </p>
        <p v-if="message" class="rounded-md bg-muted px-3 py-2 text-sm">{{ message }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button v-if="reading" class="px-3 py-2 text-sm text-muted-foreground" @click="recognition.cancel()">
          {{ t('cancel') }}
        </button>
        <template v-else>
          <button v-if="photo" class="px-3 py-2 text-sm text-muted-foreground" @click="reset">
            {{ t('retake') }}
          </button>
          <button v-if="photo" class="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" @click="readAsync">
            {{ hints.length ? t('readAnyway') : t('read') }}
          </button>
        </template>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { Camera, ImageUp, Loader2, RotateCcw, RotateCw } from "@lucide/vue";
import type { Photo } from "~/lib/paperNotes/importPage";
import type { Rotation } from "~/lib/paperNotes/mapResult";
import { DEFAULT_HANDWRITING } from "~/lib/paperNotes/fonts";
import { decodeAsync, photoQuality, type QualityHint } from "~/lib/paperNotes/workingCopy";
import { toast } from "vue-sonner";
import { reportError } from "~/lib/errors";
import { getPageSize } from "~/utils/pageTemplates";

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();
const notebook = useNotebookStore();
const recognition = usePaperNoteRecognition();
const reading = recognition.reading;


const photo = shallowRef<Omit<Photo, "rotation"> | null>(null);
const bitmap = shallowRef<ImageBitmap | null>(null);
const previewUrl = ref("");
const rotation = ref<Rotation>(0);
const hints = ref<QualityHint[]>([]);
const message = ref("");

function reset() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  bitmap.value?.close();
  photo.value = null;
  bitmap.value = null;
  previewUrl.value = "";
  rotation.value = 0;
  hints.value = [];
  message.value = "";
}

watch(isOpen, (open) => { if (!open) reset(); });
onUnmounted(reset);

const turn = (by: Rotation) => { rotation.value = ((rotation.value + by) % 360) as Rotation; };

async function onFileAsync(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  reset();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = await decodeAsync(bytes, file.type);
    bitmap.value = decoded;
    photo.value = { bytes, mimeType: file.type, fileName: file.name, width: decoded.width, height: decoded.height };
    previewUrl.value = URL.createObjectURL(file);
    hints.value = photoQuality(decoded);
  } catch (error) {
    console.warn("[haex-notes] Could not open the photo:", error);
    message.value = t("unreadable");
  }
}

async function readAsync() {
  if (!photo.value || !bitmap.value) return;
  message.value = "";
  try {
    const imported = await recognition.readAsync(
      { ...photo.value, rotation: rotation.value }, bitmap.value, getPageSize("portrait"), DEFAULT_HANDWRITING,
    );
    await notebook.addImportedPageAsync(imported);
    const { processing } = imported.paperImport;
    if (processing.state === "failed") {
      message.value = t(`error.${processing.error}`);
      photo.value = null;
      return;
    }
    if (processing.state === "ready") {
      toast.success(t("readBy", { model: processing.model ?? "?", place: t(`place.${processing.place ?? "this_device"}`) }));
    }
    isOpen.value = false;
  } catch (error) {
    reportError(error);
  }
}
</script>

<i18n lang="yaml">
de:
  title: Foto importieren
  description: Fotografiere eine Mitschrift, ein Tafelbild oder ein Arbeitsblatt. holzi liest es mit dem Modell, das du dort freigegeben hast.
  takePhoto: Foto aufnehmen
  chooseFile: Datei wählen
  preview: Vorschau des Fotos
  turnLeft: Nach links drehen
  turnRight: Nach rechts drehen
  read: Lesen
  readAnyway: Trotzdem lesen
  retake: Neu aufnehmen
  reading: Die Seite wird gelesen …
  cancel: Abbrechen
  unreadable: Das Foto lässt sich nicht öffnen.
  readBy: "Gelesen von {model} ({place})"
  place:
    this_device: auf diesem Gerät
    network: im eigenen Netz
    cloud: in der Cloud
  quality:
    dark: Das Foto ist sehr dunkel.
    lowContrast: Das Foto ist sehr flau.
    blurry: Das Foto wirkt unscharf.
    retake: Ein neues Foto wird besser gelesen.
  error:
    no_capable_model: Die Seite enthält nur das Foto. Gib in holzi ein Modell frei, das Bilder annimmt.
    consent_denied: Die Seite enthält nur das Foto, weil die Übertragung abgelehnt wurde.
    unusable: Auf dem Foto wurde nichts Brauchbares erkannt. Die Seite enthält nur das Foto; ein neues Foto hilft oft.
    timeout: Das Lesen hat zu lange gedauert. Die Seite enthält nur das Foto.
    unavailable: Das Modell war nicht erreichbar. Die Seite enthält nur das Foto.
    processing_failed: Die Seite enthält nur das Foto, weil die Verarbeitung fehlgeschlagen ist.
en:
  title: Import a photo
  description: Take a photo of notes, a blackboard or a worksheet. holzi reads it with the model you allowed there.
  takePhoto: Take a photo
  chooseFile: Choose a file
  preview: Preview of the photo
  turnLeft: Turn left
  turnRight: Turn right
  read: Read
  readAnyway: Read anyway
  retake: Take again
  reading: Reading the page …
  cancel: Cancel
  unreadable: The photo cannot be opened.
  readBy: "Read by {model} ({place})"
  place:
    this_device: on this device
    network: in your network
    cloud: in the cloud
  quality:
    dark: The photo is very dark.
    lowContrast: The photo is very flat.
    blurry: The photo looks blurred.
    retake: A new photo is read better.
  error:
    no_capable_model: The page holds only the photo. Allow a model that takes images in holzi.
    consent_denied: The page holds only the photo because sending it was refused.
    unusable: Nothing usable was found on the photo. The page holds only the photo; a new photo often helps.
    timeout: Reading took too long. The page holds only the photo.
    unavailable: The model could not be reached. The page holds only the photo.
    processing_failed: The page holds only the photo because processing failed.
</i18n>
