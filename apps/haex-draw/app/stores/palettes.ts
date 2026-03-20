import { eq, asc } from "drizzle-orm";
import { palettes, type SelectPalette } from "~/database/schemas";

export const usePaletteStore = defineStore("palettes", () => {
  const haexVault = useHaexVaultStore();

  const items = ref<SelectPalette[]>([]);
  const isLoaded = ref(false);

  const loadAsync = async () => {
    const db = haexVault.orm;
    if (!db) return;
    items.value = await db.select().from(palettes).orderBy(asc(palettes.sortOrder));

    // Create default palette on first use
    if (items.value.length === 0) {
      await db.insert(palettes).values({
        id: crypto.randomUUID(),
        name: "Favoriten",
        colors: [],
        sortOrder: 0,
      });
      items.value = await db.select().from(palettes).orderBy(asc(palettes.sortOrder));
    }

    isLoaded.value = true;
  };

  const createAsync = async (name: string) => {
    const db = haexVault.orm;
    if (!db) return null;
    const id = crypto.randomUUID();
    await db.insert(palettes).values({
      id,
      name,
      colors: [],
      sortOrder: items.value.length,
    });
    await loadAsync();
    return items.value.find(p => p.id === id) ?? null;
  };

  const deleteAsync = async (id: string) => {
    const db = haexVault.orm;
    if (!db) return;
    await db.delete(palettes).where(eq(palettes.id, id));
    items.value = items.value.filter(p => p.id !== id);
  };

  const renameAsync = async (id: string, name: string) => {
    const db = haexVault.orm;
    if (!db) return;
    await db.update(palettes).set({ name }).where(eq(palettes.id, id));
    const p = items.value.find(p => p.id === id);
    if (p) p.name = name;
  };

  const addColorAsync = async (paletteId: string, color: string) => {
    const db = haexVault.orm;
    if (!db) return;
    const p = items.value.find(p => p.id === paletteId);
    if (!p) return;
    const normalized = color.toLowerCase();
    if (p.colors.includes(normalized)) return;
    const newColors = [...p.colors, normalized];
    await db.update(palettes).set({ colors: newColors }).where(eq(palettes.id, paletteId));
    p.colors = newColors;
  };

  const removeColorAsync = async (paletteId: string, colorIndex: number) => {
    const db = haexVault.orm;
    if (!db) return;
    const p = items.value.find(p => p.id === paletteId);
    if (!p || colorIndex < 0 || colorIndex >= p.colors.length) return;
    const newColors = p.colors.filter((_, i) => i !== colorIndex);
    await db.update(palettes).set({ colors: newColors }).where(eq(palettes.id, paletteId));
    p.colors = newColors;
  };

  return {
    items,
    isLoaded,
    loadAsync,
    createAsync,
    deleteAsync,
    renameAsync,
    addColorAsync,
    removeColorAsync,
  };
});
