export const useEventPreviewStore = defineStore("eventPreview", () => {
  const isOpen = ref(false);
  const eventId = ref<string | null>(null);
  /**
   * dtstart of the clicked occurrence (ISO). For recurring events this is the
   * specific occurrence the user clicked, so the preview shows that date rather
   * than the master's base date. Null for non-recurring / unspecified.
   */
  const occurrenceStart = ref<string | null>(null);

  function open(id: string, occStart?: string | null) {
    eventId.value = id;
    occurrenceStart.value = occStart ?? null;
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
    eventId.value = null;
    occurrenceStart.value = null;
  }

  return { isOpen, eventId, occurrenceStart, open, close };
});
