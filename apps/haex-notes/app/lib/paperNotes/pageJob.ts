import type { ModelJob, ModelJobFormat, ModelJobImage } from "@haex-space/vault-sdk";

/**
 * Der Auftrag „Seitenerkennung“ an holzis Modelle (haex-space/haex-vault@
 * 74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/contracts/page-job.md):
 * erst die Seite in Regionen lesen, dann die gelesenen Texte korrigieren. holzi wählt das
 * freigegebene Modell, fragt vor dem Versand außerhalb des Geräts und verwirft Ausgabe, die nicht
 * zum Format passt.
 */

/** Anweisung zum Lesen. Ändert sich ihre Bedeutung, steigt die Version von {@link PAGE_FORMAT}. */
export const READ_INSTRUCTION = `This is a photo of a student's handwritten notes, a blackboard picture or a worksheet, in German.
Split the page into regions and return ONLY a JSON object:
{"regions": [{"kind": "text" | "table" | "image", "box": [x1, y1, x2, y2], "text": "...", "rows": [["cell", ...], ...]}], "rotation": 0}
Rules:
- box uses coordinates 0-1000 relative to the image width and height.
- "text": transcribe the handwriting exactly as written, keep line breaks, do not correct anything.
- "table": give "rows" as a list of rows of cell strings, an empty cell as "", no "text".
- "image": drawings, diagrams, sketches and photos, no "text".
- List regions in reading order. Do not invent content that is not on the page.
- "rotation": the clockwise degrees (0, 90, 180 or 270) the photo must be turned to stand upright.`;

/** Anweisung zum Korrigieren. Ändert sich ihre Bedeutung, steigt die Version von {@link TEXT_FIX_FORMAT}. */
export const FIX_INSTRUCTION = `These are the regions of a German page read from handwriting. Correct only spelling and words
that were clearly misread in their "text"; keep abbreviations, line breaks and the wording otherwise.
Return ONLY {"texts": [...]} with one corrected text per region that has a "text", in the same order.`;

export const PAGE_FORMAT: ModelJobFormat = {
  "name": "page-recognition",
  "version": 1,
  "schema": {
    "type": "object",
    "required": [
      "regions"
    ],
    "properties": {
      "regions": {
        "type": "array",
        "maxItems": 512,
        "items": {
          "type": "object",
          "required": [
            "kind",
            "box"
          ],
          "properties": {
            "kind": {
              "enum": [
                "text",
                "image",
                "table"
              ]
            },
            "box": {
              "type": "array",
              "items": {
                "type": "number",
                "minimum": 0,
                "maximum": 1000
              },
              "minItems": 4,
              "maxItems": 4
            },
            "text": {
              "type": "string",
              "maxLength": 20000
            },
            "rows": {
              "type": "array",
              "items": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "rotation": {
        "enum": [
          0,
          90,
          180,
          270
        ],
        "description": "Clockwise degrees the photo must be turned to stand upright"
      }
    }
  }
};

export const TEXT_FIX_FORMAT: ModelJobFormat = {
  name: "text-fix",
  version: 1,
  schema: {
    type: "object",
    required: ["texts"],
    properties: { texts: { type: "array", items: { type: "string" } } },
  },
};

/** Der Auftrag für eine Arbeitskopie (JPEG, Base64). */
export function buildPageJob(workingCopyBase64: string): ModelJob {
  const image: ModelJobImage = { mimeType: "image/jpeg", data: workingCopyBase64 };
  return {
    steps: [
      {
        id: "read",
        needs: ["text", "image"],
        instruction: READ_INSTRUCTION,
        input: { images: [image] },
        format: PAGE_FORMAT,
        effort: "medium",
        maxOutputTokens: 8192,
      },
      {
        id: "fix",
        needs: ["text"],
        instruction: FIX_INSTRUCTION,
        input: { from: { step: "read", pointer: "/regions" } },
        format: TEXT_FIX_FORMAT,
        effort: "low",
      },
    ],
  };
}
