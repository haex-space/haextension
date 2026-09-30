import type { PageBackground, PageElement, PageLayer } from "~/types/document";

/**
 * Der veränderliche Seitenzustand, auf dem Kommandos arbeiten.
 *
 * Bewusst ein einfaches Objekt ohne Pinia und ohne Vue-Refs: dadurch sind die
 * Kommandos ohne Store testbar. Der Store hält diese Objekte und macht sie über
 * `reactive()` beobachtbar.
 */
export interface PageDoc {
  id: string;
  layers: PageLayer[];
  background: PageBackground;
  width: number;
  height: number;
}

export interface Command {
  label: string;
  pageId: string;
  apply(): void;
  revert(): void;
  /** Gesetzt, wenn aufeinanderfolgende Kommandos zu einer Geste gehören (z.B. ein Drag). */
  mergeKey?: string;
  /** Faltet `next` in dieses Kommando. Wird nur bei gleichem mergeKey aufgerufen. */
  merge?(next: Command): void;
}

type Mutator = (element: PageElement) => void;

interface MutateCommand extends Command {
  readonly mutators: Mutator[];
}

const clone = <T>(value: T): T => structuredClone(value);

function findLayer(page: PageDoc, layerId: string): PageLayer {
  const layer = page.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error(`Layer ${layerId} not found on page ${page.id}`);
  return layer;
}

/** Führt mehrere Kommandos als eines aus. Revert läuft in umgekehrter Reihenfolge. */
export function composite(label: string, pageId: string, ...commands: Command[]): Command {
  return {
    label,
    pageId,
    apply() {
      for (const command of commands) command.apply();
    },
    revert() {
      for (let i = commands.length - 1; i >= 0; i--) commands[i]!.revert();
    },
  };
}

export function addElements(
  page: PageDoc,
  layerId: string,
  elements: PageElement[],
  label: string,
): Command {
  const added = clone(elements);
  const addedIds = new Set(added.map((e) => e.id));
  return {
    label,
    pageId: page.id,
    apply() {
      findLayer(page, layerId).elements.push(...clone(added));
    },
    revert() {
      const layer = findLayer(page, layerId);
      layer.elements = layer.elements.filter((e) => !addedIds.has(e.id));
    },
  };
}

interface RemovedRef {
  layerId: string;
  index: number;
  element: PageElement;
}

export function removeElements(page: PageDoc, elementIds: string[], label: string): Command {
  let removed: RemovedRef[] = [];
  return {
    label,
    pageId: page.id,
    apply() {
      const wanted = new Set(elementIds);
      removed = [];
      for (const layer of page.layers) {
        // Rückwärts, damit das Splicen die noch nicht besuchten Indizes nicht verschiebt.
        for (let i = layer.elements.length - 1; i >= 0; i--) {
          const element = layer.elements[i]!;
          if (!wanted.has(element.id)) continue;
          removed.push({ layerId: layer.id, index: i, element: clone(element) });
          layer.elements.splice(i, 1);
        }
      }
    },
    revert() {
      // Aufsteigend einsetzen, damit jeder Index wieder dort landet, wo er herkam.
      for (const ref of [...removed].sort((a, b) => a.index - b.index)) {
        findLayer(page, ref.layerId).elements.splice(ref.index, 0, clone(ref.element));
      }
    },
  };
}

/** Ersetzt Elemente durch andere — für Radierer-Split, Formerkennung, Gruppierung. */
export function replaceElements(
  page: PageDoc,
  layerId: string,
  removeIds: string[],
  add: PageElement[],
  label: string,
): Command {
  return composite(
    label,
    page.id,
    removeElements(page, removeIds, label),
    addElements(page, layerId, add, label),
  );
}

/**
 * Ändert Elemente an Ort und Stelle. Deckt Verschieben, Skalieren, Rotieren,
 * Eigenschaftsänderungen und das Vertical-Space-Tool ab — deshalb gibt es dafür
 * keine eigenen Kommandos.
 *
 * Der Zustand vor der ersten Anwendung wird als Snapshot festgehalten; Revert
 * spielt ihn zurück. Bei gleichem `mergeKey` sammelt das erste Kommando die
 * Mutatoren der folgenden ein, sodass eine ganze Drag-Geste ein Undo-Schritt ist.
 */
export function mutateElements(
  page: PageDoc,
  elementIds: string[],
  mutate: Mutator,
  label: string,
  mergeKey?: string,
): MutateCommand {
  const mutators: Mutator[] = [mutate];
  let before: { layerId: string; element: PageElement }[] | null = null;

  const forEachTarget = (fn: (element: PageElement, layer: PageLayer) => void) => {
    const wanted = new Set(elementIds);
    for (const layer of page.layers) {
      for (const element of layer.elements) {
        if (wanted.has(element.id)) fn(element, layer);
      }
    }
  };

  return {
    label,
    pageId: page.id,
    mergeKey,
    mutators,
    apply() {
      if (before === null) {
        const snapshot: { layerId: string; element: PageElement }[] = [];
        forEachTarget((element, layer) => snapshot.push({ layerId: layer.id, element: clone(element) }));
        before = snapshot;
      }
      forEachTarget((element) => {
        for (const mutator of mutators) mutator(element);
      });
    },
    revert() {
      if (!before) return;
      for (const { layerId, element } of before) {
        const layer = findLayer(page, layerId);
        const index = layer.elements.findIndex((e) => e.id === element.id);
        if (index >= 0) layer.elements[index] = clone(element);
      }
    },
    merge(next) {
      // `next` wurde vom Stack bereits angewendet, der Dokumentzustand stimmt also.
      // Wir übernehmen nur seine Mutatoren, damit ein späteres Redo die ganze
      // Geste nachspielt.
      mutators.push(...(next as MutateCommand).mutators);
    },
  };
}

export function addLayer(
  page: PageDoc,
  layer: PageLayer,
  index: number | undefined,
  label: string,
): Command {
  const snapshot = clone(layer);
  const at = index ?? page.layers.length;
  return {
    label,
    pageId: page.id,
    apply() {
      page.layers.splice(at, 0, clone(snapshot));
    },
    revert() {
      page.layers = page.layers.filter((l) => l.id !== snapshot.id);
    },
  };
}

export function removeLayer(page: PageDoc, layerId: string, label: string): Command {
  if (page.layers.length <= 1) {
    throw new Error("Cannot remove the last layer of a page");
  }
  const index = page.layers.findIndex((l) => l.id === layerId);
  if (index < 0) throw new Error(`Layer ${layerId} not found on page ${page.id}`);
  const snapshot = clone(page.layers[index]!);
  return {
    label,
    pageId: page.id,
    apply() {
      page.layers = page.layers.filter((l) => l.id !== layerId);
    },
    revert() {
      page.layers.splice(index, 0, clone(snapshot));
    },
  };
}

export function moveLayer(page: PageDoc, layerId: string, toIndex: number, label: string): Command {
  const fromIndex = page.layers.findIndex((l) => l.id === layerId);
  if (fromIndex < 0) throw new Error(`Layer ${layerId} not found on page ${page.id}`);
  return {
    label,
    pageId: page.id,
    apply() {
      const [moved] = page.layers.splice(fromIndex, 1);
      page.layers.splice(toIndex, 0, moved!);
    },
    revert() {
      const [moved] = page.layers.splice(toIndex, 1);
      page.layers.splice(fromIndex, 0, moved!);
    },
  };
}

export function mutateLayer(
  page: PageDoc,
  layerId: string,
  patch: Partial<Pick<PageLayer, "name" | "visible" | "locked">>,
  label: string,
): Command {
  let before: Partial<PageLayer> | null = null;
  return {
    label,
    pageId: page.id,
    apply() {
      const layer = findLayer(page, layerId);
      if (before === null) {
        before = {};
        for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
          (before as Record<string, unknown>)[key] = layer[key];
        }
      }
      Object.assign(layer, patch);
    },
    revert() {
      if (before) Object.assign(findLayer(page, layerId), before);
    },
  };
}

export function setPageBackground(page: PageDoc, next: PageBackground, label: string): Command {
  const after = clone(next);
  let before: PageBackground | null = null;
  return {
    label,
    pageId: page.id,
    apply() {
      before ??= clone(page.background);
      page.background = clone(after);
    },
    revert() {
      if (before) page.background = clone(before);
    },
  };
}
