import type { ApplicationContext } from "@haex-space/vault-sdk";
import { watchImmediate } from "@vueuse/core";

export const useUiStore = defineStore("ui", () => {
  const context = ref<ApplicationContext | null>(null);
  const currentThemeName = ref<"dark" | "light">("dark");

  const colorMode = useColorMode();

  watchImmediate(currentThemeName, () => {
    colorMode.preference = currentThemeName.value;
  });

  return {
    context,
    currentThemeName,
  };
});
