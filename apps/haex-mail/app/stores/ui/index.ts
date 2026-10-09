import { breakpointsTailwind, useBreakpoints, useLocalStorage, watchImmediate } from "@vueuse/core";
import type { ApplicationContext } from "@haex-space/vault-sdk";

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

  return {
    context,
    currentThemeName,
    isMediumScreen,
    mailFormat,
  };
});
