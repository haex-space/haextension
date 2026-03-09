export const useEventDrawerStore = defineStore("eventDrawer", () => {
  const isOpen = ref(false);
  const eventId = ref<string | null>(null);

  function open(id: string) {
    eventId.value = id;
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
    eventId.value = null;
  }

  return { isOpen, eventId, open, close };
});
