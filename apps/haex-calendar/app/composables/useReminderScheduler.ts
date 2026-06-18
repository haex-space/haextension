import { or, inArray } from "drizzle-orm";
import { events, eventReminders } from "~/database/schemas";
import { expandOccurrences } from "~/lib/rrule";

/**
 * In-app reminder scheduler.
 *
 * Keeps an in-memory, time-sorted queue of the reminders due within the next
 * 24h and fires them via the SDK notifications API. The queue is rebuilt on
 * start, every 30 minutes, and whenever the caller signals a change (see
 * `refresh`). Recurring events are expanded on the fly.
 *
 * Known limitation (documented): reminders only fire while haex-vault is
 * running. Persistent OS-scheduled notifications would need a host background
 * service and are out of scope.
 */

type ReminderEntry = {
  fireAt: number; // epoch ms
  eventId: string;
  summary: string;
  occurrenceStart: Date;
  offsetMinutes: number;
  allDay: boolean;
};

const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const REFILL_MS = 30 * 60 * 1000;

export function useReminderScheduler() {
  const haexVault = useHaexVaultStore();
  const eventTypesStore = useEventTypesStore();
  const eventsStore = useEventsStore();
  // Global scope: this composable is instantiated inside a component setup
  // that already calls useI18n() — a local-scope call here would trigger
  // Vue-I18n's "Duplicate useI18n calling by local scope" warning.
  const { locale } = useI18n({ useScope: "global" });

  let queue: ReminderEntry[] = [];
  let fireTimer: ReturnType<typeof setTimeout> | null = null;
  let refillTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function rebuildAsync() {
    if (!haexVault.orm) return;
    const now = Date.now();
    const horizon = now + LOOKAHEAD_MS;

    // 1. Own reminders, grouped by event.
    const reminderRows = await haexVault.orm.select().from(eventReminders);
    const ownByEvent = new Map<string, number[]>();
    for (const row of reminderRows) {
      const list = ownByEvent.get(row.eventId);
      if (list) list.push(row.offsetMinutes);
      else ownByEvent.set(row.eventId, [row.offsetMinutes]);
    }

    // 2. Type defaults — read the already-loaded store. We must NOT refetch
    // here: the caller (a watcher on `eventTypesStore.types` /
    // `remindersByType`) re-runs us *because* those refs changed, so the store
    // is already current. Refetching reassigns those refs and re-triggers the
    // watcher → infinite loop.
    const typesWithReminders = eventTypesStore.types
      .filter((t) => eventTypesStore.getTypeReminders(t.id).length > 0)
      .map((t) => t.id);

    const ownIds = [...ownByEvent.keys()];
    if (ownIds.length === 0 && typesWithReminders.length === 0) {
      queue = [];
      scheduleHead();
      return;
    }

    // 3. Candidate events: those with own reminders OR a type that has defaults.
    const candidates = await haexVault.orm
      .select()
      .from(events)
      .where(
        or(
          ownIds.length ? inArray(events.id, ownIds) : undefined,
          typesWithReminders.length ? inArray(events.eventTypeId, typesWithReminders) : undefined,
        ),
      );

    // Expand far enough that a long lead-time reminder (e.g. 1 week) for an
    // event up to 24h+offset away still surfaces.
    const allOffsets = [
      ...reminderRows.map((r) => r.offsetMinutes),
      ...eventTypesStore.types.flatMap((t) => eventTypesStore.getTypeReminders(t.id)),
    ];
    const maxOffsetMin = allOffsets.length ? Math.max(...allOffsets) : 0;
    const expandEnd = new Date(horizon + maxOffsetMin * 60_000);

    const entries: ReminderEntry[] = [];
    for (const ev of candidates) {
      // Completed (non-recurring) tasks don't remind anymore.
      if (ev.kind === "task" && ev.completedAt) continue;

      const offsets = ownByEvent.get(ev.id) ?? eventTypesStore.getTypeReminders(ev.eventTypeId);
      if (!offsets.length) continue;

      const rule = eventsStore.effectiveRrule(ev);
      const starts = rule
        ? expandOccurrences(rule, new Date(ev.dtstart), new Date(now), expandEnd)
        : [new Date(ev.dtstart)];

      for (const start of starts) {
        for (const offsetMinutes of offsets) {
          const fireAt = start.getTime() - offsetMinutes * 60_000;
          if (fireAt >= now && fireAt <= horizon) {
            entries.push({
              fireAt,
              eventId: ev.id,
              summary: ev.summary,
              occurrenceStart: start,
              offsetMinutes,
              allDay: ev.allDay,
            });
          }
        }
      }
    }

    entries.sort((a, b) => a.fireAt - b.fireAt);
    queue = entries;
    scheduleHead();
  }

  function scheduleHead() {
    if (fireTimer) {
      clearTimeout(fireTimer);
      fireTimer = null;
    }
    const head = queue[0];
    if (!head) return;
    // Lookahead caps the delay at 24h, well under setTimeout's overflow limit.
    const delay = Math.max(0, head.fireAt - Date.now());
    fireTimer = setTimeout(fireHeadAsync, delay);
  }

  async function fireHeadAsync() {
    const entry = queue.shift();
    if (entry) await fireAsync(entry);
    scheduleHead();
  }

  async function fireAsync(entry: ReminderEntry) {
    try {
      await haexVault.client.notifications.show({
        title: entry.summary,
        body: formatBody(entry),
        primary: { path: `/event/${entry.eventId}` },
        // Re-firing the same occurrence+offset replaces the previous one.
        tag: `reminder:${entry.eventId}:${entry.occurrenceStart.toISOString()}:${entry.offsetMinutes}`,
      });
    } catch (error) {
      console.warn("[haex-calendar] Failed to show reminder notification:", error);
    }
  }

  function formatBody(entry: ReminderEntry): string {
    return new Intl.DateTimeFormat(locale.value, {
      dateStyle: "medium",
      timeStyle: entry.allDay ? undefined : "short",
    }).format(entry.occurrenceStart);
  }

  function start() {
    if (running) return;
    running = true;
    void rebuildAsync();
    refillTimer = setInterval(() => void rebuildAsync(), REFILL_MS);
  }

  function stop() {
    running = false;
    if (fireTimer) clearTimeout(fireTimer);
    if (refillTimer) clearInterval(refillTimer);
    fireTimer = null;
    refillTimer = null;
    queue = [];
  }

  /** Recompute the queue now (call after event / type / reminder mutations). */
  function refresh() {
    if (running) void rebuildAsync();
  }

  return { start, stop, refresh };
}
