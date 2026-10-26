/**
 * Ein Eingabefeld, das ein Doppelklick auf der Seite öffnet, verliert den Fokus gleich wieder:
 * Die Maus-Ereignisse desselben Klicks setzen ihn nach dem Öffnen auf die Seite. Dieses Blur ist
 * kein Wegklicken und darf die Eingabe nicht beenden. Erst wenn das Feld den Fokus zurückgeholt
 * hat, zählt ein Blur.
 */
export function createBlurGuard() {
  let armed = false;
  return {
    /** Das Feld hat den Fokus nach dem Öffnen zurückgeholt. */
    arm() {
      armed = true;
    },
    /** Ob ein Blur jetzt die Eingabe beendet. */
    endsInput() {
      return armed;
    },
  };
}
