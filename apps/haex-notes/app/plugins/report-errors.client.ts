import { reportError } from "~/lib/errors";

// Fehler aus Event-Handlern, Lifecycle-Hooks und Watchern der Komponenten kommen
// hier an. Ohne diese Grenze bliebe eine fehlgeschlagene Aktion für den Nutzer
// unsichtbar und stünde nur in der Konsole.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("vue:error", (err) => reportError(err));
});
