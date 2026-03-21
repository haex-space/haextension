import { eq } from "drizzle-orm";
import { pencilCase, type PenSlot } from "~/database/schemas";

const DEFAULT_SLOTS: PenSlot[] = [
  { id: "1", name: "Fineliner", type: "fineliner", color: "#000000", size: 2 },
  { id: "2", name: "Kugelschreiber", type: "ballpoint", color: "#1e40af", size: 3 },
  { id: "3", name: "Bleistift", type: "pencil", color: "#4b5563", size: 2 },
  { id: "4", name: "Textmarker", type: "highlighter", color: "#facc15", size: 16 },
  { id: "5", name: "Radierer", type: "eraser", color: "#ffffff", size: 12 },
];

export const usePencilCaseStore = defineStore("pencilCase", () => {
  const haexVault = useHaexVaultStore();

  const slots = ref<PenSlot[]>([...DEFAULT_SLOTS]);
  const maxSlots = ref(5);
  const activeSlotId = ref<string>("1");
  const isLoaded = ref(false);

  const activeSlot = computed(() => slots.value.find(s => s.id === activeSlotId.value) ?? slots.value[0]!);

  const loadAsync = async () => {
    const db = haexVault.orm;
    if (!db) return;

    const result = await db.select().from(pencilCase).where(eq(pencilCase.id, "default"));
    if (result.length > 0) {
      const row = result[0]!;
      if (row.slots && row.slots.length > 0) {
        slots.value = row.slots;
      }
      maxSlots.value = row.maxSlots;
    } else {
      // Create default pencil case
      await db.insert(pencilCase).values({
        id: "default",
        slots: DEFAULT_SLOTS,
        maxSlots: 5,
      });
    }
    isLoaded.value = true;
  };

  const saveAsync = async () => {
    const db = haexVault.orm;
    if (!db) return;
    const data = JSON.parse(JSON.stringify(slots.value));
    await db.update(pencilCase).set({ slots: data, maxSlots: maxSlots.value }).where(eq(pencilCase.id, "default"));
  };

  const selectSlot = (id: string) => {
    activeSlotId.value = id;
  };

  const updateSlot = async (id: string, updates: Partial<PenSlot>) => {
    const slot = slots.value.find(s => s.id === id);
    if (!slot) return;
    Object.assign(slot, updates);
    await saveAsync();
  };

  const addSlot = async () => {
    if (slots.value.length >= maxSlots.value) return;
    const newSlot: PenSlot = {
      id: crypto.randomUUID(),
      name: "Neuer Stift",
      type: "fineliner",
      color: "#000000",
      size: 2,
    };
    slots.value.push(newSlot);
    await saveAsync();
    return newSlot;
  };

  const removeSlot = async (id: string) => {
    if (slots.value.length <= 1) return;
    slots.value = slots.value.filter(s => s.id !== id);
    if (activeSlotId.value === id) {
      activeSlotId.value = slots.value[0]!.id;
    }
    await saveAsync();
  };

  const setMaxSlots = async (max: number) => {
    maxSlots.value = Math.max(1, Math.min(20, max));
    await saveAsync();
  };

  return {
    slots,
    maxSlots,
    activeSlotId,
    activeSlot,
    isLoaded,
    loadAsync,
    selectSlot,
    updateSlot,
    addSlot,
    removeSlot,
    setMaxSlots,
  };
});
