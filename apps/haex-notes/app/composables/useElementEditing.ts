import type { TextElement } from "~/types/document";
import { editableElement, editCell, editText, placeElement, setFontFamily, type Box } from "~/lib/elementEdits";
import { CELL_FONT_SIZE, measureTextHeight } from "~/lib/render/elements";
import { boxOf, cellAt, draggedBox, elementAt, HANDLE_RADIUS, isSelectable, onResizeHandle, type Point, type Selectable } from "~/lib/selection";
import { cellsOf } from "~/lib/tableActions";

/** Was der Texteditor gerade bearbeitet: einen Textblock oder eine Zelle. */
export interface TextEdit {
  elementId: string;
  cell?: { row: number; column: number };
  box: Box;
  text: string;
  fontFamily: string;
  fontSize: number;
}

/** Schrift des Zelltexts, wie der Renderer ihn zeichnet. */
const CELL_FONT = { fontFamily: "sans-serif", fontSize: CELL_FONT_SIZE };
/** Erst ab dieser Strecke (Bildschirmpixel) ist ein Tippen ein Ziehen; ein Stift zittert immer etwas. */
const DRAG_THRESHOLD = 3;
/** Zwei Tipps so kurz und so nah hintereinander sind ein Doppeltipp, auch wo kein dblclick kommt. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DISTANCE = 8;

/**
 * Auswählen, Verschieben und Skalieren von Text, Bild und Tabelle, und das Bearbeiten von Text
 * und Zellen per Doppelklick (US3 in haex-space/haex-vault@d91e91721e4aca4e926fb6c32152c79f317b2d52:specs/046-paper-notes-canvas/spec.md).
 * Jede Änderung läuft als Kommando über den Undo-Stack; das Original bleibt unberührt.
 */
export function useElementEditing(redrawOverlay: () => void) {
  const notebook = useNotebookStore();
  const selectedId = ref<string | null>(null);
  const editing = ref<TextEdit | null>(null);
  let drag: { mode: "move" | "resize"; start: Box; origin: Point; gestureId: string; zoom: number; moved: boolean } | null = null;
  let lastTap: { point: Point; time: number } | null = null;

  /** Nur auf sichtbaren Ebenen: in der Ansicht „Original“ bleibt kein Rahmen über dem Foto stehen. */
  const selected = computed<Selectable | null>(() => {
    const doc = notebook.currentDoc;
    const element = doc && selectedId.value ? editableElement(doc, selectedId.value) : null;
    const visible = doc?.layers.some((layer) => layer.visible && layer.elements.some((e) => e === element));
    return element && visible && isSelectable(element) ? element : null;
  });

  const clear = () => {
    selectedId.value = null;
    editing.value = null;
    drag = null;
    redrawOverlay();
  };
  watch(() => notebook.currentPage?.id, clear);

  let measureContext: CanvasRenderingContext2D | null = null;
  const heightOf = (text: TextElement) => {
    measureContext ??= document.createElement("canvas").getContext("2d");
    return measureContext ? measureTextHeight(measureContext, text) : text.height;
  };

  function pointerDown(point: Point, zoom: number) {
    const now = Date.now();
    const isDoubleTap = !!lastTap && now - lastTap.time < DOUBLE_TAP_MS
      && Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) < DOUBLE_TAP_DISTANCE / zoom;
    lastTap = isDoubleTap ? null : { point, time: now };
    if (isDoubleTap) {
      drag = null;
      doubleClick(point);
      return;
    }
    const current = selected.value;
    const onHandle = !!current && onResizeHandle(current, point, zoom);
    const doc = notebook.currentDoc;
    const target = onHandle ? current : doc ? elementAt(doc.layers, point) : null;
    selectedId.value = target?.id ?? null;
    drag = target
      ? { mode: onHandle ? "resize" : "move", start: boxOf(target), origin: point, gestureId: crypto.randomUUID(), zoom, moved: false }
      : null;
    redrawOverlay();
  }

  /** true, solange eine Geste läuft; dann gehört die Bewegung ihr. */
  function pointerMove(point: Point): boolean {
    const element = selected.value;
    if (!drag || !element) return false;
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    if (!drag.moved && Math.hypot(dx, dy) * drag.zoom < DRAG_THRESHOLD) return true;
    drag.moved = true;
    const box = draggedBox(drag.start, dx, dy, drag.mode, element.type === "image");
    // Ein Text wird breiter oder schmaler; seine Höhe folgt dem Umbruch.
    if (element.type === "text") box.height = heightOf({ ...element, width: box.width });
    const mergeKey = `place:${drag.gestureId}`;
    notebook.applyEdit((doc) => placeElement(doc, element.id, box, mergeKey));
    redrawOverlay();
    return true;
  }

  function pointerUp(): boolean {
    const active = drag !== null;
    drag = null;
    return active;
  }

  function doubleClick(point: Point) {
    const doc = notebook.currentDoc;
    const element = doc ? elementAt(doc.layers, point) : null;
    if (element?.type === "text") {
      selectedId.value = element.id;
      editing.value = { elementId: element.id, box: boxOf(element), text: element.text, fontFamily: element.fontFamily, fontSize: element.fontSize };
    } else if (element?.type === "table") {
      const cell = cellAt(element, point);
      if (!cell) return;
      selectedId.value = element.id;
      editing.value = {
        elementId: element.id, cell: { row: cell.row, column: cell.column }, box: cell.box,
        text: cellsOf(element)[cell.row]![cell.column]!, ...CELL_FONT,
      };
    }
    redrawOverlay();
  }

  function commit(text: string) {
    const edit = editing.value;
    editing.value = null;
    if (!edit || text === edit.text) return;
    const { cell } = edit;
    if (cell) {
      notebook.applyEdit((doc) => editCell(doc, edit.elementId, cell.row, cell.column, text));
      return;
    }
    // Nicht die Auswahl: ein Klick auf die Seite wählt neu, bevor das Textfeld den Fokus verliert.
    const doc = notebook.currentDoc;
    const element = doc ? editableElement(doc, edit.elementId) : null;
    if (element?.type !== "text") return;
    notebook.applyEdit((page) => editText(page, element.id, text, heightOf({ ...element, text })));
  }

  const cancel = () => { editing.value = null; };

  function setFont(fontFamily: string) {
    const element = selected.value;
    if (element?.type !== "text" || element.fontFamily === fontFamily) return;
    notebook.applyEdit((doc) => setFontFamily(doc, element.id, fontFamily, heightOf({ ...element, fontFamily })));
  }

  /** Rahmen und Griff der Auswahl, auf dem Overlay in Seitenkoordinaten. */
  function drawSelection(ctx: CanvasRenderingContext2D, zoom: number) {
    const element = selected.value;
    if (!element) return;
    const box = boxOf(element);
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    if (element.type !== "table") {
      const half = HANDLE_RADIUS / 2 / zoom;
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(box.x + box.width - half, box.y + box.height - half, half * 2, half * 2);
      ctx.strokeRect(box.x + box.width - half, box.y + box.height - half, half * 2, half * 2);
    }
    ctx.restore();
  }

  return { selected, editing, pointerDown, pointerMove, pointerUp, commit, cancel, setFont, drawSelection, clear };
}
