import { watchImmediate } from "@vueuse/core";

export const useUiStore = defineStore("ui", () => {
  const context = ref<any>(null);
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
