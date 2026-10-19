/** In-app path a reminder notification opens: the event and its occurrence. */
export function eventDeepLink(eventId: string, occurrence: string): string {
  return `/event/${encodeURIComponent(eventId)}?at=${encodeURIComponent(occurrence)}`;
}

export function parseEventDeepLink(path: string | undefined): { eventId: string; occurrence: string | null } | null {
  const match = path?.match(/^\/event\/([^?]+)(?:\?at=([^&]+))?$/);
  if (!match?.[1]) return null;
  try {
    return {
      eventId: decodeURIComponent(match[1]),
      occurrence: match[2] ? decodeURIComponent(match[2]) : null,
    };
  } catch {
    return null;
  }
}
