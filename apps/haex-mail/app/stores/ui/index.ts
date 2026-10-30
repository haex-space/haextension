import { breakpointsTailwind, useBreakpoints, useLocalStorage, watchImmediate } from "@vueuse/core";
import type { ApplicationContext } from "@haex-space/vault-sdk";
import type { AccountPrefill } from "~/lib/connection";
import type { ComposePrefill } from "~/lib/openers";

export const useUiStore = defineStore("ui", () => {
  const context = ref<ApplicationContext | null>(null);
  const currentThemeName = ref<"dark" | "light">("dark");

  const breakpoints = useBreakpoints(breakpointsTailwind);
  const isMediumScreen = breakpoints.greaterOrEqual("md");

  const colorMode = useColorMode();

  watchImmediate(currentThemeName, () => {
    colorMode.preference = currentThemeName.value;
  });

  const mailFormat = useLocalStorage<"text" | "html">("haex-mail:mailFormat", "html");

  /** Details the agent prepared for the account form; the form takes them once. */
  const accountPrefill = ref<AccountPrefill | null>(null);
  /** Set when the account form should open (the settings page reacts and clears it). */
  const accountSetupRequested = ref(false);

  /** The fields a mail link filled in (`openers.client.ts`); the compose dialog takes them once. */
  const composePrefill = ref<ComposePrefill | null>(null);

  /** A local draft the compose dialog is to open and continue (picked in the list of drafts). */
  const openDraftId = ref<string | null>(null);

  return {
    accountPrefill,
    composePrefill,
    openDraftId,
    accountSetupRequested,
    context,
    currentThemeName,
    isMediumScreen,
    mailFormat,
  };
});
