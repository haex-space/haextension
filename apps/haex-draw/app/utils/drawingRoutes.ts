/**
 * Route of a fresh drawing. The id is chosen up front, so every "new drawing"
 * navigation leads somewhere else, even from a new drawing that is still unsaved.
 */
export function newDrawingLocation() {
  return { path: `/draw/${crypto.randomUUID()}`, query: { new: "1" } };
}
