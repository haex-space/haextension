import { eq } from "drizzle-orm";
import {
  eventTypes,
  eventTypeReminders,
  events,
  type SelectEventType,
} from "~/database/schemas";

export type { SelectEventType };

/**
 * Event-Types ("Termin-Arten") store.
 *
 * Manages the local `event_types` table plus each type's default reminders
 * (`event_type_reminders`). Reminders are modelled as a flat list of
 * offset-minutes per type; on save we replace the whole set (the lists are
 * tiny). Deleting a type nulls `events.event_type_id` for its events — the
 * DB has no FK for that column (added via ALTER COLUMN), so we enforce the
 * `ON DELETE SET NULL` behaviour here in app code.
 */
export const useEventTypesStore = defineStore("eventTypes", () => {
  const haexVault = useHaexVaultStore();

  const allTypes = ref<SelectEventType[]>([]);
  /** typeId → sorted offset-minutes of that type's default reminders. */
  const remindersByType = ref<Record<string, number[]>>({});
  const isLoading = ref(false);

  async function loadTypesAsync() {
    if (!haexVault.orm) return;
    isLoading.value = true;
    try {
      allTypes.value = await haexVault.orm.select().from(eventTypes);

      const reminderRows = await haexVault.orm.select().from(eventTypeReminders);
      const grouped: Record<string, number[]> = {};
      for (const row of reminderRows) {
        (grouped[row.eventTypeId] ??= []).push(row.offsetMinutes);
      }
      for (const id of Object.keys(grouped)) {
        grouped[id]!.sort((a, b) => a - b);
      }
      remindersByType.value = grouped;
    } finally {
      isLoading.value = false;
    }
  }

  async function replaceTypeRemindersAsync(typeId: string, offsets: number[]) {
    if (!haexVault.orm) return;
    await haexVault.orm
      .delete(eventTypeReminders)
      .where(eq(eventTypeReminders.eventTypeId, typeId));
    for (const offsetMinutes of offsets) {
      await haexVault.orm.insert(eventTypeReminders).values({
        id: crypto.randomUUID(),
        eventTypeId: typeId,
        offsetMinutes,
      });
    }
  }

  async function createTypeAsync(data: {
    name: string;
    color: string;
    defaultRrule?: string | null;
    reminderOffsets?: number[];
  }) {
    if (!haexVault.orm) return;
    const id = crypto.randomUUID();
    await haexVault.orm.insert(eventTypes).values({
      id,
      name: data.name,
      color: data.color,
      defaultRrule: data.defaultRrule ?? null,
    });
    if (data.reminderOffsets?.length) {
      await replaceTypeRemindersAsync(id, data.reminderOffsets);
    }
    await loadTypesAsync();
    return id;
  }

  async function updateTypeAsync(
    id: string,
    data: {
      name: string;
      color: string;
      defaultRrule?: string | null;
      reminderOffsets?: number[];
    },
  ) {
    if (!haexVault.orm) return;
    await haexVault.orm
      .update(eventTypes)
      .set({
        name: data.name,
        color: data.color,
        defaultRrule: data.defaultRrule ?? null,
      })
      .where(eq(eventTypes.id, id));
    await replaceTypeRemindersAsync(id, data.reminderOffsets ?? []);
    await loadTypesAsync();
  }

  /**
   * Count events currently referencing this type — shown in the delete
   * confirmation so the user knows how many events will fall back to "no type".
   */
  async function countEventsForTypeAsync(id: string): Promise<number> {
    if (!haexVault.orm) return 0;
    const rows = await haexVault.orm
      .select({ id: events.id })
      .from(events)
      .where(eq(events.eventTypeId, id));
    return rows.length;
  }

  async function deleteTypeAsync(id: string) {
    if (!haexVault.orm) return;
    // App-enforced ON DELETE SET NULL: detach events from the type first.
    await haexVault.orm
      .update(events)
      .set({ eventTypeId: null })
      .where(eq(events.eventTypeId, id));
    // event_type_reminders has a real FK (ON DELETE CASCADE) → removed with the type.
    await haexVault.orm.delete(eventTypes).where(eq(eventTypes.id, id));
    await loadTypesAsync();
  }

  function getType(id: string | null | undefined) {
    if (!id) return undefined;
    return allTypes.value.find((type) => type.id === id);
  }

  function getTypeReminders(id: string | null | undefined): number[] {
    if (!id) return [];
    return remindersByType.value[id] ?? [];
  }

  return {
    types: allTypes,
    remindersByType,
    isLoading,
    loadTypesAsync,
    createTypeAsync,
    updateTypeAsync,
    deleteTypeAsync,
    countEventsForTypeAsync,
    getType,
    getTypeReminders,
  };
});
