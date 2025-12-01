import {
  breakpointsTailwind,
  useBreakpoints,
  watchImmediate,
} from "@vueuse/core";
import de from "./de.json";
import en from "./en.json";

export const useUiStore = defineStore("uiStore", () => {
  const breakpoints = useBreakpoints(breakpointsTailwind);

  // "smAndDown" gilt für sm, xs usw.
  const isSmallScreen = breakpoints.smaller("sm");

  // "mdAndUp" gilt für md, lg, xl usw.
  const isMediumScreen = breakpoints.greaterOrEqual("md");

  const { $i18n } = useNuxtApp();

  $i18n.setLocaleMessage("de", {
    ui: de,
  });
  $i18n.setLocaleMessage("en", { ui: en });

  const availableThemes = ref([
    {
      value: "dark",
      label: $i18n.t("ui.dark"),
      icon: "line-md:moon-rising-alt-loop",
    },
    {
      value: "light",
      label: $i18n.t("ui.light"),
      icon: "line-md:moon-to-sunny-outline-loop-transition",
    },
  ]);

  const defaultTheme = ref("dark");

  const currentThemeName = ref(defaultTheme.value);

  const currentTheme = computed(
    () =>
      availableThemes.value.find(
        (theme) => theme.value === currentThemeName.value
      ) ?? availableThemes.value.at(0)
  );

  const colorMode = useColorMode();

  watchImmediate(currentThemeName, () => {
    colorMode.preference = currentThemeName.value;
  });

  const context = ref();

  const currentLocale = ref();

  // WORKAROUND for Nuxt UI bug: UTabs disappear after UDrawer closes
  // Related GitHub issues:
  //   * https://github.com/emilkowalski/vaul/issues/572 (vaul layout shift)
  //   * https://github.com/nuxt/ui/issues/3523 (UDrawer shifts layout)
  // TODO: Remove when upstream bug is fixed
  const tabsRerenderKey = ref(0);
  const activeTabIndex = ref<string>("0");

  function triggerTabsRerender() {
    tabsRerenderKey.value++;
  }

  return {
    availableThemes,
    context,
    currentLocale,
    currentTheme,
    currentThemeName,
    defaultTheme,
    isSmallScreen,
    isMediumScreen,
    tabsRerenderKey,
    activeTabIndex,
    triggerTabsRerender,
  };
});
