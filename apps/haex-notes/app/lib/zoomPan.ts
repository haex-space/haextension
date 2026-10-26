/**
 * Zoom und Verschieben eines Bildes im Betrachter für Anhänge (holzi Spec 046, FR-023). Ein `View` ist
 * die Abbildung vom Bild auf den Betrachter: Punkt im Betrachter = Bildpunkt * scale + (x, y).
 */

export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Wie weit man über und unter der Einpassung zoomen darf. */
export const ZOOM_RANGE = { below: 0.5, above: 8 };

/** Das ganze Bild, in die Fläche gepasst und zentriert. */
export function fitView(box: Size, content: Size): View {
  if (content.width <= 0 || content.height <= 0 || box.width <= 0 || box.height <= 0) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min(box.width / content.width, box.height / content.height);
  return { scale, x: (box.width - content.width * scale) / 2, y: (box.height - content.height * scale) / 2 };
}

/**
 * Zoomt um `factor` und hält den Punkt `at` (im Betrachter) an derselben Stelle des Bildes. Der Maßstab
 * bleibt zwischen `ZOOM_RANGE.below` und `ZOOM_RANGE.above` mal dem der Einpassung `fitScale`.
 */
export function zoomAt(view: View, factor: number, at: Point, fitScale: number): View {
  const scale = Math.min(Math.max(view.scale * factor, fitScale * ZOOM_RANGE.below), fitScale * ZOOM_RANGE.above);
  const ratio = scale / view.scale;
  return { scale, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio };
}

/** Verschiebt das Bild um `dx`, `dy` Pixel des Betrachters. */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}
