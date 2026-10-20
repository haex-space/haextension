import { breakpointsTailwind, useBreakpoints, useLocalStorage, watchImmediate } from "@vueuse/core";
import type { ApplicationContext } from "@haex-space/vault-sdk";
import type { AccountPrefill } from "~/lib/connection";

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

  return {
    accountPrefill,
    accountSetupRequested,
    context,
    currentThemeName,
    isMediumScreen,
    mailFormat,
  };
});
