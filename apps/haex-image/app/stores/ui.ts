import { watchImmediate } from "@vueuse/core";

export const useUiStore = defineStore("ui", () => {
  const currentThemeName = ref<"dark" | "light">("dark");

  const colorMode = useColorMode();

  watchImmediate(currentThemeName, () => {
    colorMode.preference = currentThemeName.value;
  });

  return {
    currentThemeName,
  };
});
