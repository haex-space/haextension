import de from "~/locales/de.json";
import en from "~/locales/en.json";

/**
 * Global messages used by stores (errors, toasts, the connection-test
 * mail) and shared across components (mailbox role labels). Component-
 * specific strings live in their SFC <i18n> blocks and fall back to
 * these global messages for shared keys.
 */
export default defineNuxtPlugin(() => {
  const { $i18n } = useNuxtApp();
  $i18n.mergeLocaleMessage("de", de);
  $i18n.mergeLocaleMessage("en", en);
});
