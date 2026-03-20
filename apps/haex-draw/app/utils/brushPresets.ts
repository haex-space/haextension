import type { BrushPreset } from "~/types";

export const BRUSH_PRESETS: BrushPreset[] = [
  // --- Bleistift: dünne, leicht raue Linie ---
  {
    id: "pencil",
    icon: "Pencil",
    i18n: { de: "Bleistift", en: "Pencil" },
    renderMode: "textured",
    jitter: 0.8,
    opacity: 0.85,
    options: {
      thinning: 0.6,
      smoothing: 0.3,
      streamline: 0.3,
      simulatePressure: true,
      start: { taper: 0, cap: true },
      end: { taper: 6, cap: true },
    },
  },

  // --- Kugelschreiber: gleichmäßig, dünn, sauber ---
  {
    id: "ballpoint",
    icon: "Pen",
    i18n: { de: "Kugelschreiber", en: "Ballpoint" },
    renderMode: "stroke",
    lineCap: "round",
    lineJoin: "round",
    options: {
      thinning: 0.15,
      smoothing: 0.6,
      streamline: 0.6,
      simulatePressure: true,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },

  // --- Filzstift: breit, deckend, runde Kappen ---
  {
    id: "felt-tip",
    icon: "PenLine",
    i18n: { de: "Filzstift", en: "Felt Tip" },
    renderMode: "fill",
    options: {
      thinning: 0.1,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: false,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },

  // --- Marker / Textmarker: halbtransparent, breit, flach ---
  {
    id: "marker",
    icon: "Highlighter",
    i18n: { de: "Textmarker", en: "Highlighter" },
    renderMode: "fill",
    opacity: 0.35,
    options: {
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.6,
      simulatePressure: false,
      start: { taper: 0, cap: false },
      end: { taper: 0, cap: false },
    },
  },

  // --- Fineliner: sehr dünn, gleichmäßig, keine Druckvariation ---
  {
    id: "fine-tip",
    icon: "Minus",
    i18n: { de: "Fineliner", en: "Fineliner" },
    renderMode: "stroke",
    lineCap: "round",
    lineJoin: "round",
    options: {
      thinning: 0,
      smoothing: 0.7,
      streamline: 0.7,
      simulatePressure: false,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },

  // --- Kalligrafie: stark drucksensitiv, dicke/dünn-Wechsel ---
  {
    id: "calligraphy",
    icon: "Feather",
    i18n: { de: "Kalligrafie", en: "Calligraphy" },
    renderMode: "fill",
    options: {
      thinning: 0.95,
      smoothing: 0.2,
      streamline: 0.15,
      simulatePressure: true,
      start: { taper: true, cap: true },
      end: { taper: true, cap: true },
    },
  },

  // --- Pinsel: weicher Strich mit Taper, drucksensitiv ---
  {
    id: "brush",
    icon: "Paintbrush",
    i18n: { de: "Pinsel", en: "Brush" },
    renderMode: "fill",
    options: {
      thinning: 0.7,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: true,
      start: { taper: true, cap: true },
      end: { taper: true, cap: true },
    },
  },

  // --- Wasserfarbe: weicher Körper, dunkle Ränder, leichtes Ausbluten ---
  {
    id: "watercolor",
    icon: "Droplets",
    i18n: { de: "Wasserfarbe", en: "Watercolor" },
    renderMode: "watercolor",
    opacity: 0.35,
    options: {
      thinning: 0.2,
      smoothing: 0.7,
      streamline: 0.6,
      simulatePressure: true,
      start: { taper: true, cap: true },
      end: { taper: true, cap: true },
    },
  },

  // --- Kreide: durchgehender Strich mit rauer, körniger Textur ---
  {
    id: "chalk",
    icon: "Hash",
    i18n: { de: "Kreide", en: "Chalk" },
    renderMode: "chalk",
    opacity: 0.85,
    jitter: 1.2,
    options: {
      thinning: 0.08,
      smoothing: 0.2,
      streamline: 0.15,
      simulatePressure: true,
      start: { taper: 0, cap: false },
      end: { taper: 0, cap: false },
    },
  },

  // --- Sprühfarbe: Airbrush mit dichtem Kern + Sprühnebel ---
  {
    id: "spray",
    icon: "SprayCan",
    i18n: { de: "Sprühfarbe", en: "Spray" },
    renderMode: "spray",
    opacity: 0.8,
    options: {
      thinning: 0,
      smoothing: 0.7,
      streamline: 0.7,
      simulatePressure: true,
      start: { taper: 0, cap: false },
      end: { taper: 0, cap: false },
    },
  },

  // --- Gestrichelte Linie ---
  {
    id: "dashed",
    icon: "MoreHorizontal",
    i18n: { de: "Gestrichelt", en: "Dashed" },
    renderMode: "dashed",
    dashPattern: [8, 6],
    lineCap: "round",
    lineJoin: "round",
    options: {
      thinning: 0,
      smoothing: 0.6,
      streamline: 0.6,
      simulatePressure: false,
      start: { taper: 0, cap: false },
      end: { taper: 0, cap: false },
    },
  },

  // --- Skizze: roh, leicht zittrig, wenig Glättung ---
  {
    id: "sketch",
    icon: "PencilLine",
    i18n: { de: "Skizze", en: "Sketch" },
    renderMode: "multi-stroke",
    multiStrokeCount: 2,
    multiStrokeSpread: 1.5,
    opacity: 0.6,
    options: {
      thinning: 0.5,
      smoothing: 0.05,
      streamline: 0.05,
      simulatePressure: true,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },

  // --- Radierer: malt mit Hintergrundfarbe ---
  {
    id: "eraser",
    icon: "Eraser",
    i18n: { de: "Radierer", en: "Eraser" },
    renderMode: "fill",
    isEraser: true,
    options: {
      thinning: 0.1,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: false,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },
];
