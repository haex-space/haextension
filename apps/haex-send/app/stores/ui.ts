// stores/ui.ts
import type { ApplicationContext } from "@haex-space/vault-sdk";
import { useMediaQuery } from "@vueuse/core";

export const useUiStore = defineStore("ui", () => {
  const currentThemeName = ref<string>("dark");
  const context = ref<ApplicationContext | null>(null);

  // Responsive breakpoints
  const isMediumScreen = useMediaQuery("(min-width: 768px)");
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  return {
    currentThemeName,
    context,
    isMediumScreen,
    isLargeScreen,
  };
});
