/** Die Farben, die ein Textblock bekommen kann; die erste ist die Tinte erkannter Texte. */
export const TEXT_COLORS: { color: string; i18n: { de: string; en: string } }[] = [
  { color: "#1f2937", i18n: { de: "Schwarz", en: "Black" } },
  { color: "#dc2626", i18n: { de: "Rot", en: "Red" } },
  { color: "#2563eb", i18n: { de: "Blau", en: "Blue" } },
  { color: "#16a34a", i18n: { de: "Grün", en: "Green" } },
  { color: "#ea580c", i18n: { de: "Orange", en: "Orange" } },
  { color: "#9333ea", i18n: { de: "Violett", en: "Purple" } },
];

/** Wie viele Papierzeilen ein Textblock je Zeile belegen kann, wie die Wahl sie anbietet. */
export const LINE_MULTIPLES = [1, 2, 3, 4];
