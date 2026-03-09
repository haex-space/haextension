export const useUiStore = defineStore("ui", () => {
  const context = ref<any>(null);
  const currentThemeName = ref<"dark" | "light">("dark");

  return {
    context,
    currentThemeName,
  };
});
