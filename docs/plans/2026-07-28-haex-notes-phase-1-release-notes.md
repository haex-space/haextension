# haex-notes Phase 1 — Release Notes

**Bezug:** [2026-07-28-haex-notes-phase-1-fundament.md](./2026-07-28-haex-notes-phase-1-fundament.md)

## Für den Nutzer sichtbar

Nichts. Undo/Redo funktioniert jetzt auch für Tabellen; sonst verhält sich die App wie vorher.

## Kompatibilitäts-Hinweis für den Release

Ab dieser Version schreibt haex-notes den Seiteninhalt in die neuen Spalten
`pages.layers`, `pages.background`, `pages.width`, `pages.height` und **nicht mehr**
in die alten Spalten `pages.strokes`, `pages.tables`, `pages.template`,
`pages.background_image`, `pages.orientation`.

**Folge:** Sobald eine Seite in dieser Version zum ersten Mal gespeichert wurde,
zeigt eine **ältere Version** von haex-notes diese Seite **leer** an. Sie liest
nur die alten Spalten, die ab dann nicht mehr aktualisiert werden.

Diese Design-Entscheidung ist bewusst getroffen (siehe Plandokument, Abschnitt
"Bekannte Folgeprobleme"): Dual-Write würde die Spalten dauerhaft doppelt halten
und den Migrationspfad blockieren.

## Empfehlung an den Release-Prozess

- Vor dem Release: alle produktiven haex-vault-Installationen auf die neue
  Extension-Version bringen, bevor mit ihr gespeichert wird. In geteilten Räumen
  gilt das für jedes Gerät, das den Raum abonniert.
- Im Release-Text auf dieses Verhalten hinweisen.

## Was in dieser Version geändert wurde (Kurzfassung)

- Neues Element-/Layer-Datenmodell (`PageLayer[]` mit `PageElement`)
- Command-basiertes Undo (`apply()`/`revert()`), notizbuchweit
- Undo/Redo für Tabellen (bisher nicht undobar)
- Dreischichtiger Canvas mit Dirty-Flags statt `requestAnimationFrame`-Dauerloop
- Filesystem-basierter Asset-Store (Bytes gehen nicht mehr in die DB)
- Sharing trägt `layers`/`background` und referenzierte Assets in den Zielraum
- Neue Migration `0004` fügt Spalten und die `assets`-Tabelle hinzu (nur `ADD`,
  kein Table-Recreate — der Sync über geteilte Räume bleibt intakt)
