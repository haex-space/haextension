// Messages shared by several components (component-specific ones live in their <i18n> blocks)
export default defineI18nConfig(() => ({
  messages: {
    de: {
      editFailed: "Die Bearbeitung ist fehlgeschlagen.",
    },
    en: {
      editFailed: "The edit failed.",
    },
  },
}));
