/** Picks the text for the UI locale of data-carried translations; every non-German locale gets English. */
export function localized(text: { de: string; en: string }, locale: string): string {
  return locale === "de" ? text.de : text.en;
}
