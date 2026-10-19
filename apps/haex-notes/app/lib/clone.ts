/**
 * Tiefe Kopie von Dokumentdaten.
 *
 * Der Store hält Seiten in Vue-reaktivem Zustand, und `structuredClone` wirft
 * auf den Proxies, die Vue herausgibt, einen DataCloneError. Der JSON-Roundtrip
 * liest durch die Proxies hindurch und hat genau die Semantik, mit der Seiten
 * in den JSON-Spalten gespeichert werden.
 */
export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
