import { toast } from "vue-sonner";

/**
 * Lesbare Meldung zu einem unbekannten Fehlerwert. Fehler des Hosts kommen als
 * einfache `{ code, message }`-Objekte an, nicht als Error-Instanzen.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** Grenze für fehlgeschlagene Aktionen: protokollieren und dem Nutzer zeigen. */
export function reportError(err: unknown): void {
  console.error("[haex-notes]", err);
  toast.error(getErrorMessage(err));
}
