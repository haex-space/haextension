import {
  breakpointsTailwind,
  useBreakpoints,
  watchImmediate,
} from "@vueuse/core";

export const useUiStore = defineStore("uiStore", () => {
  const breakpoints = useBreakpoints(breakpointsTailwind);

  const isSmallScreen = breakpoints.smaller("sm");
  const isMediumScreen = breakpoints.greaterOrEqual("md");

  const defaultTheme = ref("dark");
  const currentThemeName = ref(defaultTheme.value);

  const colorMode = useColorMode();

  watchImmediate(currentThemeName, () => {
    colorMode.preference = currentThemeName.value;
  });

  const context = ref();

  return {
    context,
    currentThemeName,
    defaultTheme,
    isSmallScreen,
    isMediumScreen,
  };
});
