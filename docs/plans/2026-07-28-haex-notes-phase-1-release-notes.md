# haex-notes Phase 1 — Release Notes

**Bezug:** [2026-07-28-haex-notes-phase-1-fundament.md](./2026-07-28-haex-notes-phase-1-fundament.md)

## Für den Nutzer sichtbar

Undo/Redo funktioniert jetzt auch für Tabellen. Zusätzlich zeigt die App beim Start einen Fehler mit
erneutem Versuch an, und der Seitentyp-Selektor ist an das aktuelle Theme angepasst. Sonst verhält sich
die App wie vorher.

## Kompatibilitäts-Hinweis für den Release

Ab dieser Version schreibt haex-notes den Seiteninhalt in die neuen Spalten
`pages.layers`, `pages.background`, `pages.width`, `pages.height` und hält die alten
Spalten `pages.strokes`, `pages.tables`, `pages.template`, `pages.background_image`,
`pages.orientation` für die in Phase 1 unterstützten Striche und Tabellen synchron.

**Folge:** Seiten mit den in Phase 1 unterstützten Elementen bleiben für ältere
Versionen lesbar. Spätere Elementtypen benötigen eine Erweiterung des alten Formats
oder eine Versionssperre, bevor sie mit älteren Clients geteilt werden.

Die Legacy-Spalten werden in Phase 1 bewusst parallel gepflegt. Für spätere
Elementtypen muss der Legacy-Pfad erweitert oder der Zugriff älterer Clients
vor dem Speichern blockiert werden.

## Empfehlung an den Release-Prozess

- Vor dem Release: alle produktiven haex-vault-Installationen auf die neue
  Extension-Version bringen, bevor spätere, nicht rückwärtskompatible Elementtypen
  gespeichert werden. In geteilten Räumen gilt das für jedes Gerät, das den Raum
  abonniert.
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
