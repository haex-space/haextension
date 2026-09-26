# haex-notes: Annäherung an Xournal++ — Design & Roadmap

**Datum:** 2026-07-28
**Status:** Design (im Brainstorming validiert, bereit für Implementierungspläne pro Phase)
**Scope:** `haextension/apps/haex-notes` — keine Änderungen an haex-vault oder SDK nötig
**Referenz:** [xournalpp/xournalpp](https://github.com/xournalpp/xournalpp)

## Rahmenentscheidungen

Im Brainstorming festgelegt:

- **Desktop und Tablet gleichwertig.** Keine Eingabeart wird bevorzugt, Feature-Parität auf beiden.
- **PDF vollständig:** Import als Seitenhintergrund *und* Export mit erhaltener Textebene. Das ist das Kernfeature von Xournal++.
- **Fundament zuerst.** Layer-/Element-Modell, Command-Undo und Render-Cache kommen vor allen sichtbaren Features.
- **Binärdaten gehören auf das Filesystem, nicht in die DB.** Harte Grenze: eine DB-Transaktion fasst max. 100 MB. Die Extension bekommt `filesystem: readWrite` und legt Dateien lokal ab.
- **Kein Remote-Storage in diesem Plan.** Sync von Dateien ist ein haex-vault-Konzept — der Nutzer richtet dort ein, was gesynct wird. Für die Extension existieren nur lokale Pfade.
- **Sharing-Anforderung bleibt unverändert:** Der Nutzer muss ein Notizbuch komplett oder seitenweise in einen Shared Space geben können. Das ist bereits umgesetzt ([spaces.ts](../../apps/haex-notes/app/stores/spaces.ts)) und muss nur an das neue Datenmodell nachgezogen werden.
- **Enthalten trotz Exotik:** LaTeX, Audio-an-Strokes, Continuous Scroll. **Nicht enthalten:** Plugin-System.

## Ausgangslage

Vorhanden in haex-notes 0.1.7:

| Bereich | Stand |
|---|---|
| Zeichnen | Freihand über `perfect-freehand`, Druckwerte werden erfasst |
| Werkzeuge | Stiftetui mit konfigurierbaren Slots (Fineliner, Kugelschreiber, Bleistift, Textmarker, Radierer) |
| Seiten | 10 Vorlagen inkl. Schul-Lineaturen, Hoch-/Querformat, Vorlagenwechsel |
| Objekte | Tabellen (verschiebbar, Spalten/Zeilen per Drag) |
| Hintergrund | Ein Bild pro Seite, fest auf 30 % Deckkraft |
| Navigation | Pan, Wheel-Zoom, Seiten-Sidebar mit Reorder, Papierkorb |
| Persistenz | Autosave alle 10 s, Undo/Redo für Striche |
| Sharing | Seiten- und Notizbuch-weites Teilen über Spaces, Import als Kopie |

Datenmodell: `pages.strokes` und `pages.tables` als JSON-Arrays, kein generisches Element- oder Layer-Konzept.

## Gap-Analyse gegen Xournal++

Sortiert nach Nutzen pro Aufwand.

### Editier-Kern — fehlt vollständig

| Feature | Warum wichtig |
|---|---|
| **Selektion** (Rechteck + Lasso) mit Verschieben, Skalieren, Rotieren, Duplizieren, Löschen, nachträglicher Farb-/Stärkeänderung | Meistgenutzte Editierfunktion überhaupt. Heute ist die einzige Korrekturmöglichkeit Undo oder Weißmalen. |
| **Copy/Paste**, auch seitenübergreifend | Direkt daran hängend |
| **Radierer-Modi**: Strich löschen, Strich splitten | Heute malt der Radierer `#ffffff` ([PageCanvas.vue:66](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L66)). Das ist auf farbigem Papier falsch, im transparenten Export falsch und auf PDF-Hintergrund komplett falsch. |
| **Layer** pro Seite mit Sichtbarkeit und Reihenfolge | Voraussetzung für „Arbeitsblatt unten, Lösung oben" |

### Werkzeuge — fehlen

| Feature | Anmerkung |
|---|---|
| **Text-Boxen** (getippt, Font/Größe/Farbe) | Xournal++ Text-Tool |
| **Formen**: Linie, Pfeil, Rechteck, Ellipse, Spline | Mit Füllung |
| **Formerkennung** | Grob gezeichnet → gesnapptes Objekt |
| **Bild als Element** | Heute nur ein Seitenhintergrund mit fixer Deckkraft, nicht verschiebbar, nicht skalierbar, mehrere unmöglich |
| **Lineal / Straightedge** | Gerade Linien freihand ziehen |
| **Snap to Grid**, Rotations-Snap | |

### Dokumente — fehlen

| Feature | Anmerkung |
|---|---|
| **PDF-Import** als Seitenhintergrund | Das Xournal++-Alleinstellungsmerkmal |
| **Export PDF** mit erhaltener Textebene | Ergebnis bleibt durchsuchbar |
| **Export PNG / SVG** | |
| **PDF-Outline** in der Sidebar | Navigation in langen Dokumenten |

### Eingabe — fehlt

| Feature | Anmerkung |
|---|---|
| **Palm Rejection / Pen-only-Modus** | Auf dem Tablet heute unbenutzbar: jede Handballen-Berührung zeichnet |
| **Pinch-Zoom** | Existiert überhaupt nicht — Zoom geht nur per Mausrad |
| **Stylus-Radiergummi-Spitze** | Umdrehen des Stifts radiert |
| **Barrel-Button-Mapping** | Stifttaste → Radierer oder Selektion |
| **Druckkurve** | Einstellbare Härte |

### Seiten & Navigation — fehlen

| Feature | Anmerkung |
|---|---|
| **Continuous Scroll** | Alle Seiten untereinander statt einer pro Ansicht |
| **Vertical-Space-Tool** | Platz einfügen/entfernen, Inhalt darunter verschiebt sich mit |
| **Freie Seitenformate** (A4/A5/Letter/frei) und **Papierfarbe** | Heute nur zwei Orientierungen einer Größe |

### Extras

| Feature | Anmerkung |
|---|---|
| **LaTeX-Formeln** | Über MathJax-SVG-Output, rein clientseitig |
| **Audio an Strokes** | Aufnahme während des Schreibens, Antippen spielt die passende Stelle |

## Drei Befunde im Bestand, die vor allen Features stehen

Diese drei sind keine Xournal++-Features, blockieren aber jedes davon.

### 1. Der Undo-Stack *ist* das Dokument

[notebook.ts:29-31](../../apps/haex-notes/app/stores/notebook.ts#L29-L31):

```ts
const activeStrokes = computed(() =>
  history.value.slice(0, historyIndex.value + 1).map(e => e.stroke)
);
```

Der Dokumentzustand ist ein Slice der History. Damit ist nur eine einzige Operation modellierbar — „Strich anhängen". Verschieben, Löschen, Eigenschaften ändern, Splitten: keines davon lässt sich in dieser Struktur ausdrücken. Tabellenänderungen sind konsequenterweise schon heute nicht undobar ([notebook.ts:294-324](../../apps/haex-notes/app/stores/notebook.ts#L294-L324) setzen nur `isDirty`).

**Muss invertiert werden:** Dokument = Layer mit Elementen, Undo = separater Command-Stack daneben.

### 2. Der Render-Loop läuft dauerhaft

[PageCanvas.vue:173-179](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L173-L179):

```ts
const loop = () => { render(); animFrameId = requestAnimationFrame(loop); };
```

`render()` zeichnet 60-mal pro Sekunde jeden Stroke der Seite neu, unabhängig davon, ob sich etwas geändert hat. Mit ein paar hundert Strichen und einem gerenderten PDF-Hintergrund ist das nicht mehr benutzbar — und auf dem Tablet frisst es Akku im Leerlauf.

**Muss ersetzt werden durch:** Dirty-Flags + gecachte Canvas-Ebenen.

### 3. Der Stiftdruck wird verworfen

[PageCanvas.vue:51-57](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L51-L57) übergibt `simulatePressure: true` an `getStroke`. In dieser Einstellung ignoriert perfect-freehand die dritte Komponente der Punkte — also genau die in [PageCanvas.vue:211](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L211) sorgfältig eingesammelten `e.pressure`-Werte — und leitet die Strichbreite stattdessen aus der Zeichengeschwindigkeit ab. Am echten Stylus ist das ein spürbarer Qualitätsverlust für einen Einzeiler.

**Fix:** `simulatePressure` nur dann `true`, wenn der Pointer keinen echten Druck liefert (Maus, Touch). Gehört in Phase 5 zum Eingabe-Umbau, kann aber sofort vorgezogen werden.

*Konfidenz: hoch, aber am Zielgerät gegenzuprüfen — WebKitGTK und Android-WebView melden `pressure` nicht identisch.*

## Architektur

### Element- und Layer-Modell

```ts
export interface PageLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  elements: PageElement[];
}

interface ElementBase {
  id: string;
  /** Achsenparallele Bounding-Box in Seitenkoordinaten.
   *  Gecacht, weil Hit-Test und Dirty-Rect sie in jedem Frame brauchen. */
  bbox: [x: number, y: number, w: number, h: number];
}

export type PageElement =
  | StrokeElement | TextElement | ImageElement
  | ShapeElement | TableElement | LatexElement;

interface StrokeElement extends ElementBase {
  type: "stroke";
  points: [number, number, number][];      // unverändert zum heutigen StrokeData
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
  audio?: { assetId: string; offsetMs: number };   // Phase 6
}

interface TextElement extends ElementBase {
  type: "text";
  x: number; y: number;
  text: string;
  fontFamily: string; fontSize: number; color: string;
  width: number;        // Umbruchbreite, 0 = kein Umbruch
  rotation: number;
}

interface ImageElement extends ElementBase {
  type: "image";
  x: number; y: number; width: number; height: number;
  rotation: number;
  assetId: string;
  opacity: number;
}

interface ShapeElement extends ElementBase {
  type: "shape";
  kind: "line" | "arrow" | "rect" | "ellipse" | "polygon";
  points: [number, number][];
  stroke: string; strokeWidth: number;
  fill?: string;
  rotation: number;
}

interface LatexElement extends ElementBase {
  type: "latex";
  x: number; y: number; width: number; height: number;
  source: string;   // LaTeX-Quelle, bleibt editierbar
  svg: string;      // gerendert, damit Anzeige ohne MathJax-Roundtrip geht
  color: string;
}
```

Der Seitenhintergrund wird ebenfalls zu einem eigenen Typ. Der Bestandsrenderer zeichnet Vorlage und Hintergrundbild schon heute übereinander — sie schließen sich nicht aus, eine Union würde das kaputtmachen. Stattdessen eine Komposition mit optionalem Overlay:

```ts
interface PageBackground {
  paperColor: string;
  template: PageTemplate;
  overlay?: ImageOverlay | PdfOverlay;
}

interface ImageOverlay {
  type: "image";
  source: { kind: "asset"; assetId: string } | { kind: "inline"; dataUrl: string };
  opacity: number;
}

interface PdfOverlay {
  type: "pdf";
  assetId: string;
  pageIndex: number;
}
```

Eine PDF-Seite ist damit `{ paperColor: "#ffffff", template: "blank", overlay: { type: "pdf", … } }`.

**Transformationen werden in die Geometrie gebacken**, nicht als Matrix mitgeschleppt. Beim Commit einer Selektion werden Punkte transformiert und `size` / `fontSize` / `strokeWidth` mit dem Skalenfaktor multipliziert. Das hält Renderer und Export simpel; der Preis sind akkumulierte Rundungsfehler bei wiederholtem Skalieren, was bei float64-Koordinaten praktisch nicht auffällt. Xournal++ macht es genauso.

### Schema-Änderungen

Neu auf `pages`:

| Spalte | Typ | Zweck |
|---|---|---|
| `layers` | TEXT (JSON) | `PageLayer[]` |
| `background` | TEXT (JSON) | `PageBackground` |
| `width`, `height` | INTEGER | Freie Seitenformate |

Neue Tabelle `assets`:

| Spalte | Typ |
|---|---|
| `id` | TEXT PK |
| `sha256` | TEXT |
| `file_name` | TEXT (Originalname für die Anzeige) |
| `mime_type` | TEXT |
| `size` | INTEGER |
| `created_at` | INTEGER |

**Keine Bytes in der DB.**

`strokes`, `tables`, `template`, `background_image` und `orientation` bleiben stehen und werden nach der Migration nicht mehr beschrieben. Grund: in einem geteilten Space können Rows von Geräten mit älterer Extension-Version eintreffen, und Spalten in SQLite zu droppen ist unangenehm. Aufräumen in einer späteren Version, wenn die Feldversionen durch sind.

**Migration ist lazy und rein**: eine Funktion `migratePageRow(row): { layers, background, width, height }`, die beim Laden greift, wenn `layers` null ist. Reine Funktion ohne DB-Zugriff, damit unit-testbar. Sie schreibt erst zurück, wenn die Seite ohnehin gespeichert wird.

### Command-basiertes Undo

```ts
interface Command {
  label: string;
  apply(): void;
  revert(): void;
  /** Coalescing gleichartiger Kommandos, z.B. während eines Drags */
  mergeWith?(next: Command): Command | null;
}
```

Der Stack ist **notizbuchweit**, nicht seitenweit — Xournal++ macht das so, und mit Continuous Scroll (Phase 5) wäre ein seitenweiter Stack ohnehin verwirrend. Jedes Kommando trägt seine `pageId`. In-memory, wird beim Schließen des Notizbuchs verworfen.

Das komplette Kommando-Set:

- `addElements(page, layerId, elements, label)`
- `removeElements(page, elementIds, label)`
- `replaceElements(page, layerId, removeIds, add, label)` — deckt Radierer-Split, Formerkennung und Gruppierung ab; ein `composite` aus `removeElements` + `addElements`
- `mutateElements(page, elementIds, mutate, label, mergeKey?)` — deckt Verschieben, Skalieren, Rotieren, Eigenschaftsänderungen und das Vertical-Space-Tool ab (ursprünglich als getrennte `TransformElements`, `SetElementProps` und `InsertVerticalSpace` geplant; setzt stattdessen einmal an, mit einer Mutator-Funktion)
- `addLayer` / `removeLayer` / `moveLayer` / `mutateLayer`
- `setPageBackground(page, next, label)`
- `composite(label, pageId, ...commands)` — führt mehrere Kommandos als eines aus, Revert in umgekehrter Reihenfolge

Mehr braucht es nicht. Jede neue Funktion, die nach einem elften Kommando verlangt, sollte zuerst prüfen, ob `replaceElements` oder `mutateElements` sie nicht schon abdeckt.

### Render-Pipeline

Drei übereinanderliegende Canvas-Ebenen statt einer:

| Ebene | Inhalt | Neu gezeichnet bei |
|---|---|---|
| `bgCanvas` | Papierfarbe, Vorlage, PDF-Seite, Hintergrundbild | Seitenwechsel, Hintergrundänderung, Zoom-Ende |
| `contentCanvas` | Alle committeten Elemente sichtbarer Layer | Änderung an `contentVersion` |
| `overlayCanvas` | Aktiver Strich, Selektionsrahmen und Handles, Lasso, Lineal, Snap-Hilfslinien | Jedes Pointer-Event |

Kein Dauerloop mehr. `scheduleRender(dirtyLayers)` setzt Flags und fordert genau ein `requestAnimationFrame` an.

**Zoom-Verhalten:** Der Cache wird in `min(devicePixelRatio × zoom, MAX_SCALE)` gerendert. Während einer laufenden Zoom-Geste wird der bestehende Cache nur skaliert gezeichnet — kurz unscharf — und 120 ms nach der letzten Änderung scharf nachgezogen. Eine A4-Seite bei 2× DPR sind rund 1240 × 1754 px ≈ 8,7 MB pro Cache-Canvas; bei Continuous Scroll werden nur die sichtbaren Seiten ± 1 gecacht.

### Asset-Store

**Ablageort:** `${knownPaths.documents}/haex-notes/assets/`, in den Einstellungen per `filesystem.selectFolder()` überschreibbar. Es gibt keinen `KnownPath` für ein extension-eigenes Datenverzeichnis, und `documents` ist auf Desktop wie Android vorhanden.

**Dateiname ist der Inhalts-Hash:** `assets/<sha256[0:2]>/<sha256>.<ext>`. Das dedupliziert automatisch (dasselbe PDF zweimal importiert = eine Datei), ist immutable und kollisionsfrei ohne Locking.

SDK-Aufrufe, alle vorhanden: `filesystem.readFile`, `writeFile`, `mkdir`, `exists`, `stat`, `remove`, `selectFile`, `selectFolder`, `saveFileAsync`, `knownPaths`.

**Manifest-Änderung:**

```diff
   "filesystem": [
-    { "target": "*", "operation": "read" }
+    { "target": "*", "operation": "readWrite" }
   ],
```

(`operation` ist der korrekte Key mit den Werten `read` / `write` / `readWrite` — haex-code nutzt genau diese Form. haex-files schreibt `action` statt `operation`, das ist dort vermutlich ein Fehler und hier nicht relevant.)

**Fehlende Dateien sind der Normalfall, nicht der Fehlerfall.** Ein Asset kann fehlen, weil der Ordner verschoben wurde, weil das Notizbuch von einem anderen Gerät kommt oder weil eine geteilte Seite empfangen wurde, deren PDF lokal nie existierte. Der Renderer zeichnet dann einen Platzhalter mit dem Originaldateinamen plus einer „Datei suchen"-Aktion. Das gehört von Anfang an ins Modell — nachgerüstet wird daraus ein Sonderfall, der überall durchschlägt.

## Phasen

Größenangaben sind relativ (S/M/L/XL), keine Zeitschätzungen.

### Phase 1 — Fundament · XL

Kein sichtbares Feature. Danach ist jedes folgende Feature klein.

1. `PageLayer` / `PageElement` in `database/schemas` definieren
2. Drizzle-Migration: `pages.layers`, `pages.background`, `pages.width`, `pages.height`, Tabelle `assets`
3. `migratePageRow()` als reine Funktion + Unit-Tests gegen echte Bestandszeilen
4. `notebook.ts` umbauen: `layers` als Quelle der Wahrheit, `activeStrokes`-Ableitung entfällt
5. `useUndoStack()` mit dem Kommando-Set oben
6. Bestehende Aktionen auf Kommandos umstellen: Strich hinzufügen, Tabellen-CRUD, Tabellen-Drag (mit `mergeWith`-Coalescing)
7. `PageCanvas.vue` auf drei Canvas-Ebenen und Dirty-Flags umbauen, `requestAnimationFrame`-Dauerloop entfernen
8. `assetStore`-Composable: `put(bytes, mime, name) → assetId`, `get(assetId) → Uint8Array | null`, `path(assetId)`
9. Manifest auf `readWrite`
10. Sharing an das neue Modell anpassen:
    - `buildPageCopies()` in [importPages.ts](../../apps/haex-notes/app/utils/importPages.ts) auf `layers` umstellen — sonst bricht der Sharing-Import
    - Beim Teilen einer Seite die von ihr referenzierten `assets`-Rows in denselben Space assignen (`FULL_ASSETS_TABLE` analog zu `FULL_PAGES_TABLE` in [spaces.ts:8](../../apps/haex-notes/app/stores/spaces.ts#L8)). Damit kennt der Empfänger Name, Typ und Größe der Datei und bekommt einen sprechenden Platzhalter statt eines leeren Rahmens.

**Verifikation:** Bestehendes Notizbuch öffnet unverändert, alle Striche und Tabellen sind da. Undo/Redo funktioniert jetzt auch für Tabellen. Im Leerlauf zeigt das Profiling 0 % CPU statt eines Dauer-rAF. Ein Notizbuch mit 1000 Strichen scrollt flüssig.

### Phase 2 — Editieren · L

11. Selektionswerkzeug: Rechteck und Lasso. Hit-Test zweistufig — bbox-Vorfilter, dann exakt (Punkt-in-Polygon gegen Stroke-Punkte beim Lasso, rotiertes Rechteck bei Text/Bild/Form)
12. Transform-Handles: 8 Skalierungsgriffe, ein Rotationsgriff, Verschieben per Drag innerhalb der Auswahl
13. Nachträgliche Eigenschaftsänderung: Farbe, Strichstärke, Deckkraft für die Auswahl
14. Copy/Paste/Duplizieren, seitenübergreifend. Interner JSON-Store für haex-notes-Kopien, zusätzlich PNG in die System-Zwischenablage. *Kein* Element-Paste zwischen Anwendungen — Custom-MIME-Types im Clipboard sind über Plattformen hinweg nicht verlässlich.
15. Radierer-Modi: „Strich löschen" (ganzes Element weg), „Teilweise löschen" (Stroke wird an den Schnittpunkten in mehrere Elemente gesplittet, `ReplaceElements`), „Weißmalen" bleibt als dritter Modus für Rückwärtskompatibilität
16. Layer-Panel in der Sidebar: anlegen, umbenennen, Sichtbarkeit, Sperren, Reihenfolge, Element auf anderen Layer verschieben

**Verifikation:** Ein Strich lässt sich auswählen, verschieben, skalieren, umfärben und mit Undo in jedem Schritt zurücknehmen. Der Radierer im Split-Modus zerlegt einen langen Strich in zwei Elemente statt weiß darüberzumalen. Ein ausgeblendeter Layer erscheint weder auf dem Bildschirm noch im Export.

### Phase 3 — Werkzeuge · L

17. Text-Werkzeug: Klick setzt eine Box, In-Place-Bearbeitung über ein overlay-positioniertes `<textarea>`, beim Verlassen wird zu `TextElement` committet
18. Formwerkzeuge: Linie, Pfeil, Rechteck, Ellipse; Shift zwingt auf 45°/Quadrat/Kreis; Füllung optional
19. Formerkennung als eigener Modus (nicht automatisch — automatisch aktiviert zerstört sie Handschrift):
    - Douglas-Peucker-Vereinfachung
    - Geschlossenheit prüfen (Start-Ende-Distanz < 15 % des Umfangs)
    - Ecken über Winkeländerung finden
    - Klassifizieren: 2 Punkte → Linie · 4 Ecken bei ~90° → Rechteck · 3 Ecken → Dreieck · geschlossen ohne Ecken bei geringer Radiusvarianz → Ellipse · offen mit Spitze am Ende → Pfeil
    - Unter der Trefferschwelle bleibt der Freihandstrich stehen
20. Bild einfügen als `ImageElement`: aus Datei (`selectFile`), aus der Zwischenablage, per Drag-and-Drop. Bytes gehen in den Asset-Store.
21. Der alte `backgroundImage`-Pfad wird zu `PageBackground.type === "image"` mit einstellbarer statt fest verdrahteter Deckkraft
22. Lineal / Straightedge: gedrückt gehaltene Taste zwingt den laufenden Strich auf eine Gerade
23. Snap to Grid, an der aktiven Seitenvorlage ausgerichtet

**Verifikation:** Text lässt sich tippen, verschieben, skalieren und wieder bearbeiten. Ein grob gezeichnetes Rechteck wird im Erkennungsmodus zu einem sauberen Rechteck und ist per Undo wieder der Rohstrich. Zwei Bilder auf einer Seite lassen sich unabhängig positionieren.

### Phase 4 — PDF und Export · XL

24. `pdfjs-dist` einbinden. Worker statisch bundeln (`import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"`) — die Extension läuft in einem Webview ohne garantiertes Netz und hat laut Manifest keine `http`-Berechtigung, ein CDN-Worker ist keine Option.
25. PDF-Import: `selectFile` → `readFile` → Hash → Asset-Store → pdf.js liest Seitenzahl und Seitengrößen → pro PDF-Seite eine `pages`-Row mit `background = { type: "pdf", assetId, pageIndex }` und den Maßen der PDF-Seite
26. PDF-Rendering auf `bgCanvas` über `page.render()`, gecacht wie jeder andere Hintergrund
27. PDF-Outline in der Sidebar über `pdf.getOutline()`
28. **`pageTemplates.ts` abstrahieren.** [renderPageTemplate](../../apps/haex-notes/app/utils/pageTemplates.ts) zeichnet heute direkt auf einen `CanvasRenderingContext2D`. Für PDF- und SVG-Export braucht es ein `DrawSink`-Interface mit den Implementierungen `CanvasSink`, `PdfSink`, `SvgSink`. Ohne diesen Schritt driften Bildschirmdarstellung und Export unweigerlich auseinander, weil jede Vorlage zweimal definiert wäre.
29. Export PDF über `pdf-lib`:
    - Seiten mit PDF-Hintergrund: Original laden, `copyPages`, Annotationen per `drawSvgPath` in den Content-Stream schreiben → **die Textebene des Originals bleibt erhalten, das Ergebnis bleibt durchsuchbar**
    - Strokes sind durch perfect-freehand bereits Outline-Polygone; das vorhandene `getSvgPathFromStroke` liefert den Pfad direkt
    - Text: `drawText`. **Achtung:** die Standard-Fonts von pdf-lib sind auf WinAnsi beschränkt. Für deutschsprachige Notizen muss `@pdf-lib/fontkit` plus eine mitgelieferte TTF eingebettet werden — das ist nicht optional.
    - Bilder: `embedPng` / `embedJpg`
    - Seiten ohne PDF-Hintergrund: neue Seite in Zielgröße, Papierfarbe als Rechteck, Vorlagenlinien über den `PdfSink`
30. Export PNG: Offscreen-Canvas in wählbarer Auflösung → `toBlob` → `filesystem.saveFileAsync`
31. Export SVG: Pfade direkt emittieren, kein Rastern

**Verifikation:** Ein mehrseitiges PDF wird importiert, beschrieben und exportiert; im Ergebnis lässt sich der Originaltext weiterhin markieren und suchen, die Annotationen sind Vektoren und bleiben beim Hineinzoomen scharf. Ein exportiertes PDF mit „Übungsblatt für Müller" zeigt korrekte Umlaute.

### Phase 5 — Eingabe und Seiten · L

32. Pointer-Router in einem `useCanvasInput`-Composable (haex-draw hat bereits eines gleichen Namens — vor dem Neubau auf Wiederverwendbarkeit prüfen). Regeln:
    - `pen` zeichnet immer
    - `touch` bei ausgeschaltetem „Mit Finger zeichnen" → Pan/Pinch; eingeschaltet → zeichnet, außer ein `pen` war in den letzten 500 ms aktiv (**Palm Rejection**)
    - zwei gleichzeitige `touch`-Pointer → immer Pinch-Zoom und Pan, nie ein Strich
    - `mouse` zeichnet, Mittel- und Rechtstaste pannen (wie heute)
33. **Pinch-Zoom** — fehlt aktuell komplett, auf dem Tablet die spürbarste Lücke
34. Stylus-Radiergummi: Chromium meldet die Rückseite als `pointerType === "pen"` mit `buttons & 32`. Ist das Bit gesetzt, gewinnt der Radierer unabhängig vom aktiven Slot. *Verhalten auf WebKitGTK und Android-WebView am Gerät verifizieren, die Meldungen unterscheiden sich.*
35. Barrel-Button (`buttons & 2`) konfigurierbar: Radierer / Selektion / nichts
36. Druckkurve `clamp(min + (max − min) × raw^gamma)` mit Live-Vorschau in den Einstellungen; `simulatePressure` nur noch bei Pointern ohne echten Druck (siehe Befund 3)
37. Freie Seitenformate (A4, A5, Letter, frei) und Papierfarbe; `orientation` wird zu einem Sonderfall von Breite/Höhe
38. Vertical-Space-Tool: `InsertVerticalSpace(pageId, y, delta)` verschiebt alle Elemente unterhalb von `y`
39. Continuous Scroll: virtualisierte Liste von Seiten-Canvases, gerendert werden nur sichtbare Seiten ± 1

**Verifikation:** Auf dem Tablet zeichnet der Handballen nicht mehr mit. Zwei Finger zoomen. Der umgedrehte Stift radiert. Ein weich geschriebener Strich sieht am Stylus anders aus als ein fester. Durch ein 50-seitiges Notizbuch lässt sich flüssig durchscrollen.

### Phase 6 — Extras · M

40. LaTeX: MathJax mit SVG-Output (KaTeX kann kein SVG). Eingabedialog mit Live-Vorschau, gespeichert werden Quelle *und* gerendertes SVG, damit die Anzeige ohne MathJax-Roundtrip auskommt und die Formel trotzdem editierbar bleibt.
41. Audio: `MediaRecorder` → Opus/WebM in den Asset-Store. Während der Aufnahme bekommt jeder entstehende Stroke `audio = { assetId, offsetMs }`. Im Wiedergabemodus springt ein Tipper auf den Strich an die passende Stelle.

**Vorbedingung für 41:** `getUserMedia` muss im Webview überhaupt funktionieren. Laut [.claude/webview-camera-research.md](../../.claude/webview-camera-research.md) braucht das auf Linux/WebKitGTK Host-seitige Konfiguration (`enable_media_stream`, `enable_webrtc`, Permission-Handler) und `gstreamer1.0-plugins-bad`. Das ist Arbeit an haex-vault, nicht an der Extension — **vor Phase-6-Beginn klären, sonst blockiert es mitten in der Umsetzung.** Dass haex-draw eine funktionierende Kamera hat, ist ein gutes, aber kein hinreichendes Indiz für das Mikrofon.

## Offene Punkte

1. **Stylus-Verhalten auf den Zielplattformen.** Die Punkte 34 und 36 hängen daran, wie WebKitGTK (Desktop-Linux) und der Android-WebView `pointerType`, `pressure` und `buttons` melden. Vor Phase 5 mit einer kleinen Testseite auf beiden Geräten messen, nicht auf die Spezifikation vertrauen.
2. **`getUserMedia` im Webview** — siehe oben, Vorbedingung für Audio.
3. **Speicherobergrenze bei Continuous Scroll.** Der Cache pro Seite liegt bei rund 9 MB. Bei welcher Seitenzahl das Fenster von ±1 nicht mehr reicht, zeigt erst die Messung in Phase 5.

## Bewusst nicht enthalten

- **Plugin-System.** Xournal++ hat Lua-Plugins. Für haex-notes ohne erkennbaren Bedarf, und eine Skript-Sandbox in einer Extension ist ein eigenes Projekt.
- **Echtzeit-Kollaboration.** Das bestehende Sharing-Modell ist bewusst „read-only teilen, dann als Kopie importieren" ([2026-07-21-haex-notes-sharing-import-design.md](./2026-07-21-haex-notes-sharing-import-design.md)). Daran ändert dieser Plan nichts.
- **Handschrifterkennung / OCR.** Hat Xournal++ auch nicht.
- **`.xopp`-Import.** Wäre nach Phase 1 vergleichsweise billig — das Format ist gezipptes XML und mappt fast eins zu eins auf das Element-Modell. Nachrüstbar, sobald jemand danach fragt.

## Reihenfolge-Begründung

Phase 1 liefert kein sichtbares Feature und ist trotzdem zuerst dran, weil jede der Phasen 2 bis 6 sonst ihr eigenes Datenmodell mitbringen müsste — so wie es `pages.tables` heute schon tut. Nach Phase 1 ist ein neuer Elementtyp ein Interface, ein Renderer-Zweig und ein Export-Zweig; ohne Phase 1 ist er zusätzlich eine Schemaspalte, ein Sonderfall in der Selektion, einer im Undo, einer im Kopieren und einer im Export.

Die Phasen 2 und 3 sind voneinander unabhängig und könnten getauscht werden. Phase 2 zuerst, weil die Selektion die Lücke ist, die im Alltag am häufigsten weh tut, und weil die Werkzeuge aus Phase 3 ohne Selektion nur halb nutzbar sind — eine Textbox, die man nicht mehr verschieben kann, ist ärgerlicher als keine Textbox.

Phase 5 steht nach Phase 4, obwohl Palm Rejection auf dem Tablet dringlich ist. Wer sie vorzieht, sollte nur die Punkte 32 bis 34 und 36 vorziehen — sie hängen an nichts aus Phase 4. Die Punkte 37 bis 39 setzen dagegen die Seitengrößen aus dem PDF-Import voraus.
