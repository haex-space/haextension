# haex-game-unicorn — Naturnahes 2D-Lernspiel

## Konzept

Ein naturnahes 2D Pixel-Art Lernspiel fuer Vorschulkinder (3-6 Jahre), komplett ohne Text spielbar.

Ein Einhorn wandert durch eine lebendige Wald- und Wiesenlandschaft. Es trifft auf Tiere, die ihm ihre Welt zeigen. Das Kind uebernimmt die Perspektive des Tieres und erlebt dessen echten Lebenszyklus — in derselben Welt, nur aus anderer Sicht und anderem Massstab.

**Kernprinzipien:**
- Naturnah und biologisch korrekt — keine Vereinfachungen zugunsten von Gameplay
- Komplett textfrei — alles wird visuell und akustisch vermittelt
- Tiefe statt Breite — lieber ein Tier komplett als viele oberflaechlich
- Die Welt als Belohnung — Fortschritt zeigt sich in der lebendiger werdenden Welt

## Erstes Oekosystem: Wiese

### Spielbare Tiere (geplant)

| | Hummel | Honigbiene | Hornisse |
|---|---|---|---|
| Nestgruendung | Koenigin allein | Schwarm (tausende) | Koenigin allein |
| Nestmaterial | Wachs, chaotisch | Wachs, perfekte Sechsecke | Papier aus Holz |
| Nahrung | Pollen + Nektar | Pollen + Nektar + Honig | Andere Insekten + Saft |
| Winter | Volk stirbt | Volk ueberlebt | Volk stirbt |
| Groesse | Mittel, pummelig | Klein, schlank | Gross, imposant |

**Erstes Tier: Hummel (Bombus)** — kompletter Jahreszyklus als Referenz-Implementation.

## Spielstruktur

### Overworld
- Frei begehbare 2D-Welt (Wald, Wiese, Berge)
- Einhorn als Hauptfigur zur Navigation
- Jahreszeiten-Zyklus veraendert die gesamte Welt
- Persistenter Weltzustand: Alle Aktionen veraendern die Overworld sichtbar
- Bestaeubte Blumen bluehen, Nest waechst, Larven schluepfen

### Perspektivwechsel
- Kind trifft Tier in der Overworld
- Beim ersten Besuch: Tier zeigt sein Problem (visuelle Zwischenszene)
- Kind uebernimmt die Rolle des Tieres in derselben Welt
- Andere Fortbewegung (fliegen/schwimmen/klettern), anderer Massstab
- Spaetere Besuche: Freie Wahl der Aufgaben

### Schwierigkeit
- Steigt langsam von Kapitel zu Kapitel
- Erster Durchlauf: Sanftes Scheitern (zurueckgestossen, Pollen verloren, kein Tod)
- Ab zweitem Durchlauf: Realistische Konsequenzen (Fressfeinde koennen Biene fangen)

### Entwicklungssequenzen
- Biologische Prozesse (Metamorphose, Wabenbau) als schrittweise Bilderbuch-Animationen
- Kind tippt um zur naechsten Phase zu kommen (eigenes Tempo)
- Beim ersten Mal nicht ueberspringbar, ab zweitem Durchlauf optional

## Hummel-Lebenszyklus: Detailliertes Spieldesign

### Kapitel 1: Das Erwachen (Frueher Fruehling)

*Das Einhorn wandert ueber eine karge, frostbedeckte Fruehlingswiese. Unter einem Grasbueschel kriecht eine dicke Hummelkoenigin aus der Erde.*

**Aufgabe: Erste Nahrung finden**
- Kind steuert die Koenigin — traege, langsam (Kaelte!)
- Muss erste Fruehblueher finden: Krokusse, Weidenkaetzchen, Schneegloeckchen
- Wiese noch fast leer — wenige Blueten, weite Wege
- Koenigin waermt sich auf durch Fluegelvibration (schnell tippen = Vibration = Temperatur steigt)
- Je waermer, desto agiler der Flug
- Visuell: Farbe wird lebhafter, Steuerung wird smoother
- Energieanzeige: Koenigin wird duenner bei Hunger (kein UI-Balken)

**Biologisches Detail:** Die Koenigin hat nur einen kleinen Honigvorrat im Magen vom Herbst. Sichtbar als "Energiebauch".

### Kapitel 2: Nestsuche (Fruehling)

**Aufgabe: Nistplatz finden**
- Tief ueber den Boden fliegen, geeignete Orte suchen
- Moegliche Plaetze: verlassenes Mauseloch, Grasbueschel, unter Baumwurzel, altes Vogelnest
- Ungeeignete Orte: zu nass, zu offen, zu hart
- Koenigin reagiert: Antennen bewegen sich (schnueffeln), kriecht rein/raus
- Visuelles Feedback: Kopfschuetteln (ungeeignet) oder zufriedenes Nicken

**Biologisches Detail:** Hummelkoeniginnen suchen alte Maeusenester — das vorhandene Nistmaterial (Moos, Gras, Haare) ist perfekte Isolierung. Im besten Nistplatz finden sich Maeusspuren und weiches Material.

### Kapitel 3: Nestbau und erste Brut (Fruehling)

**Aufgabe 3a: Wachstoepfchen bauen**
- Koenigin produziert Wachs (Wachsplaettchen erscheinen am Koerper)
- Wachs zu kleinen Toepfchen formen (Drag & Drop)
- Ergebnis: Kleine, unregelmaessige Wachstoepfe (NICHT perfekte Sechsecke — das kommt bei der Honigbiene!)

**Aufgabe 3b: Pollen-Klumpen als Proviant**
- Koenigin fliegt raus, sammelt Pollen
- Zurueck im Nest: Pollen als Klumpen in Wachszelle druecken
- Eier werden AUF den Pollenklumpen gelegt

**Aufgabe 3c: Brueten**
- Koenigin setzt sich auf Eier wie eine Glucke
- Vibriert mit Fluegelmuskeln fuer Waerme (gleiche Tipp-Mechanik wie Aufwaermen)
- Temperaturanzeige: Farbwechsel der Zellen (blau = kalt, warm-orange = gut)
- Zwischendurch: Rausfliegen fuer Nektar (Energiebauch!)
- Dilemma: Zu lange weg = Brut kuehlt aus. Zu lange brueten = Hunger
- Koenigin hat separates "Honigtoepfchen" neben der Brut fuer die Nacht

### Kapitel 4: Die ersten Arbeiterinnen (Spaeter Fruehling)

**Entwicklungssequenz (Bilderbuch-Animation):**
- Ei → winzige Larve (weisslich, C-foermig)
- Larve frisst Pollenklumpen, wird groesser
- Larve spinnt Kokon (seidiger Faden)
- Verpuppung — Kokon wackelt
- Hummel beisst sich durch Kokon → schluepft!
- Arbeiterin deutlich kleiner als Koenigin (ca. halb so gross)
- Feucht, Fluegel entfalten sich, erste wackelige Schritte

**Aufgabe: Orientierungsflug**
- Perspektivwechsel zur Arbeiterin
- Kontrast: Viel kleiner, Welt wirkt nochmal groesser
- Kreise um den Nesteingang (werden groesser)
- Landschaftsmerkmale einpraegen (Objekte leuchten kurz auf)

### Kapitel 5: Sammelbetrieb (Fruehsommer)

**Aufgabe 5a: Blueten lesen lernen**
- Verschiedene Blueten: Klee, Lavendel, Taubnessel, Fingerhut
- Jede Bluete erfordert andere Landetechnik:
  - Klee: Aufsetzen, langen Ruessel einfaedeln
  - Fingerhut: In die Roehre kriechen, mit Pollen bedeckt rauskommen
  - Taubnessel: Von unten, Kopf reindruecken
  - Loewenmaeulchen: Nur Hummel schwer genug um Klappe aufzudruecken (Honigbiene kann das nicht!)

**Aufgabe 5b: Buzz Pollination (Vibrationsbestaeubung)**
- Nur Hummeln koennen das!
- Tomaten, Heidelbeeren — Pollen sitzen fest in Roehren
- Hummel vibriert auf Bluete (schnelles Tippen)
- Pollen schiessen aus Roehren heraus — visuell befriedigend

**Aufgabe 5c: Nahrung zurueckbringen**
- Pollenhoeschen an Beinen sichtbar (leuchtend gelb/orange)
- Nektar im Magen (langsamerer Flug wenn voll)
- Im Nest: Pollen abstreifen, Nektar in Honigtoepfchen
- Andere Arbeiterinnen fuettern Larven

### Kapitel 6: Gefahren (Sommer)

**Gefahr 1: Kuckuckshummel (Psithyrus)**
- Fremde Hummel schleicht sich zum Nest
- Sieht fast aus wie eigene, aber anders (dickere Beine, weniger Haare)
- Versucht einzudringen und Koenigin zu toeten
- Kind muss als Waechterin Eindringling erkennen und abwehren
- Visuelles Erkennungs-Puzzle: Welche Hummel gehoert nicht zu uns?

**Gefahr 2: Grosse Wollbiene**
- Territoriales Maennchen patrouilliert ueber Bluehfleck
- Attackiert Hummel mit Dornen am Hinterleib
- Bewachten Bereich meiden oder schnell rein und raus

**Gefahr 3: Krabbenspinne**
- Lauert in Bluete, perfekt getarnt (gleiche Farbe!)
- Vor dem Landen genau hinschauen
- Hinweise: Leichte Bewegung, winziges Bein das hervorlugt

**Gefahr 4: Wetter**
- Ploetzlicher Regen — unterstellen (unter Blatt, in Bluete)
- Hummeln koennen bei leichtem Regen fliegen (Kontrast zur Honigbiene!)
- Bei Starkregen sind Tropfen aus Hummelperspektive gefaehrlich gross

### Kapitel 7: Neue Generation (Spaetsommer)

**Entwicklungssequenz:**
- Koenigin legt besondere Eier
- Unbefruchtete Eier → Drohnen (Maennchen)
- Besonders gefuetterte befruchtete Eier → neue Koeniginnen
- Groessere Zellen fuer Koeniginnen, mehr Futter sichtbar

**Aufgabe: Paarungsflug**
- Kind steuert junge Koenigin beim Ausflug
- Drohnen verschiedener Voelker fliegen umher
- Paarung als gemeinsamer Flug, Herz-Animation
- Junge Koenigin frisst sich Reserven an (Energiebauch wird dick)

### Kapitel 8: Abschied (Herbst)

**Zwischenszene: Das Volk loest sich auf**
- Alte Koenigin wird schwaecher
- Arbeiterinnen werden weniger
- Nest wird stiller — emotional, aber natuerlich
- Letzte Arbeiterinnen bewegen sich kaum noch

**Aufgabe: Winterquartier suchen**
- Kind steuert junge, befruchtete Koenigin
- Geschuetzte Stelle zum Eingraben finden
- Lockere Erde, Nordhang (kuehler, verhindert zu fruehes Aufwachen), geschuetzt vor Naesse
- Koenigin graebt sich ein, rollt sich zusammen
- Bildschirm wird dunkler, Schnee faellt

**Zurueck in der Overworld:** Winter. Wiese still. Unter der Erde wartet eine Koenigin. Die bestaeubten Blueten haben Samen verbreitet — naechster Fruehling wird bunter.

## Die lebendige Welt

### Atmosphaere & Immersion

Die Welt ist nie still:
- Graeser wiegen sich im Wind
- Schmetterlinge flattern vorbei
- Wolken ziehen, Schatten wandern
- Lichtflecken tanzen durch Baumkronen
- Wasser glitzert, Libellen schwirren
- Kaefer krabbeln ueber Blaetter
- Voegel fliegen im Hintergrund
- Bluetenblätter fallen von Baeumen

**Parallax-Scrolling** fuer Tiefe: Hintergrund (Berge, Himmel) langsam, Mittelgrund (Baeume) schneller, Vordergrund (Graeser) am schnellsten.

### Interaktive Details
- Tippen auf Blume → wackelt, Bluetenstaub stiebt
- Tippen auf Wasser → Wellen
- Einhorn durch hohes Gras → Halme biegen sich
- Kleine Tiere reagieren auf Einhorn (weichen aus, schauen neugierig)

### Jahreszeiten

**Fruehling:** Zartes Gruen, Knospen oeffnen sich, Morgenlicht, Regenschauer mit Regenbogen
**Sommer:** Sattes Gruen, volle Blueten, Insekten ueberall, goldenes Licht, Gewitter am Horizont
**Herbst:** Orangetoene, fallende Blaetter, Nebelschwaden, Pilze, Tiere sammeln Vorraete
**Winter:** Schnee auf Aesten, gefrorener Teich, ruhige Atmosphaere, Atemwoelkchen beim Einhorn

### Tageszeiten
Sanfter Lichtwechsel: Morgenrot → Tageslicht → Goldene Stunde → Daemmerung. Nicht Echtzeit, aber innerhalb einer Session merkbar.

## Audio-Konzept

### Ambient-Soundscape (je nach Oekosystem + Jahreszeit)
- Wiese: Grillen zirpen, Hummeln brummen, Wind durch Graeser
- Wald: Specht klopft, Blaetter rascheln, Aeste knarzen
- Teich: Froesche quaken, Wasser plaetschert, Schilfgras
- Winter: Gedaempfte Stille, Wind, Schnee knirscht unter Hufen

### Echte Tiergerausche
- Bienen/Hummeln: Authentisches Summen (unterschiedlich je Aktivitaet)
- Voegel: Artengerechte Rufe (Amsel, Kuckuck, Meise — jahreszeitlich korrekt)
- Fressfeinde: Hornisse aggressiveres Brummen, Vogelruf als Warnung

### Musik
- Sanfte, orchestrale Hintergrundmusik
- Wechselt pro Jahreszeit
- Spannungsmomente bei Fressfeinden (leiser, Herzschlag-Beat)
- Erfolgsmomente: Kurze melodische Phrase

### Feedback-Sounds
- Pollen sammeln → sanftes "Poff"
- Bluete bestaeubgt → Gloeckchen
- Nektar aufnehmen → zartes Schluerfzen
- Wabe versiegeln → "Klick"
- Fressfeind naht → dumpfes Warnsignal

### Quellen
- Vogelstimmen: xeno-canto (CC0, wissenschaftlich dokumentiert)
- Insekten, Wasser, Wind: freesound.org
- Artenauswahl biologisch korrekt fuer das jeweilige Habitat

## Technische Architektur

### Stack
- **Framework:** Nuxt 4 SPA (extends haex-ui)
- **Game Engine:** Phaser (Arcade Physics, WebGL + Canvas Fallback)
- **Steuerung:** Touch-first, Maus-Fallback
- **Persistenz:** SQLite via haex-vault Extension Database API
- **Rendering:** Pixel-Art Modus (pixelArt: true, kein Antialiasing)
- **Aufloesung:** 480x320 Basis, Scale.FIT auf Container

### Extension-Konfiguration
- Name: `haex-game-unicorn`
- Permissions: `database` (world_state, completed_tasks, flowers, nest)
- Display Mode: auto
- Single Instance: true

### Projektstruktur

```
apps/haex-game-unicorn/
├── haextension/
│   ├── manifest.json
│   ├── public.key
│   └── haex-game-unicorn-logo.png
├── app/
│   ├── app.vue
│   ├── pages/
│   │   └── index.vue                    # Phaser Canvas Mount
│   ├── assets/
│   │   ├── css/tailwind.css
│   │   ├── sprites/                     # Spritesheets (PNG + JSON)
│   │   │   ├── unicorn/
│   │   │   ├── bumblebee/
│   │   │   │   ├── queen.png
│   │   │   │   ├── worker.png
│   │   │   │   └── drone.png
│   │   │   ├── environment/
│   │   │   │   ├── flowers/
│   │   │   │   ├── trees/
│   │   │   │   └── ground/
│   │   │   └── dangers/
│   │   ├── tilemaps/                    # Tiled-Editor Karten
│   │   │   ├── overworld-spring.json
│   │   │   ├── overworld-summer.json
│   │   │   ├── overworld-autumn.json
│   │   │   └── overworld-winter.json
│   │   └── audio/
│   │       ├── music/
│   │       ├── sfx/
│   │       └── ambience/
│   ├── game/                            # Phaser Game Core
│   │   ├── config.ts                    # Phaser.Game Konfiguration
│   │   ├── scenes/
│   │   │   ├── BootScene.ts             # Asset Loading
│   │   │   ├── OverworldScene.ts        # Einhorn-Welterkundung
│   │   │   ├── NestSearchScene.ts       # Hummel: Nistplatz suchen
│   │   │   ├── NestInteriorScene.ts     # Im Nest: Waben, Brut
│   │   │   ├── ForagingScene.ts         # Sammelflug draussen
│   │   │   ├── DangerScene.ts           # Fressfeind-Begegnungen
│   │   │   └── CutsceneScene.ts         # Bilderbuch-Sequenzen
│   │   ├── entities/
│   │   │   ├── Unicorn.ts
│   │   │   ├── BumblebeeQueen.ts
│   │   │   ├── BumblebeeWorker.ts
│   │   │   └── dangers/
│   │   │       ├── CuckooHumblebee.ts
│   │   │       ├── CrabSpider.ts
│   │   │       └── WoolBee.ts
│   │   ├── systems/
│   │   │   ├── SeasonSystem.ts          # Jahreszeitenlogik
│   │   │   ├── WorldStateSystem.ts      # Persistenter Weltzustand
│   │   │   ├── WeatherSystem.ts         # Regen, Wind, Temperatur
│   │   │   └── AudioSystem.ts           # Ambient + Musik + SFX
│   │   ├── ui/
│   │   │   └── TouchControls.ts         # Touch-Input Handling
│   │   └── data/
│   │       ├── flowers.ts               # Blueten-Definitionen
│   │       └── chapters.ts              # Kapitel-/Aufgabenstruktur
│   ├── composables/
│   │   ├── useGame.ts                   # Phaser <-> Vue Bridge
│   │   └── useWorldState.ts             # Spielstand-Management
│   └── types/
│       └── game.ts
├── nuxt.config.ts
├── package.json
└── haextension.config.json
```

### Phaser <-> Vue Architektur

```
Vue/Nuxt Shell
  ├── pages/index.vue          (Canvas Mount)
  ├── composables/useGame.ts   (Bridge: erstellt Phaser-Instanz, reactive Refs)
  ├── composables/useWorldState.ts (DB-Persistenz)
  │
  ├── Events (Phaser → Vue, Vue → Phaser)
  │
  └── Phaser Game Core
      ├── Scenes (Overworld, NestSearch, Foraging, ...)
      ├── Entities (Unicorn, BumblebeeQueen, ...)
      ├── Systems (Season, Weather, WorldState, Audio)
      └── UI/Touch Controls
```

`useGame.ts` erstellt die Phaser-Instanz, mounted auf div in index.vue, bietet reactive Refs (currentSeason, currentChapter). Phaser emittiert Events, Vue reagiert.

`useWorldState.ts` verwaltet persistenten Spielstand via Extension Database API.

### Szenen-Flow

```
BootScene (Asset Loading)
    ↓
OverworldScene (Einhorn laeuft)
    ↓ tippt auf Hummelnest
CutsceneScene (Hummel zeigt Problem)
    ↓
NestSearchScene / ForagingScene / NestInteriorScene
    ↓ Aufgabe erledigt
CutsceneScene (Ergebnis-Sequenz)
    ↓
OverworldScene (Welt hat sich veraendert)
```

### Datenbank-Schema

```sql
CREATE TABLE world_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  season TEXT NOT NULL DEFAULT 'spring',
  day_progress REAL NOT NULL DEFAULT 0,
  chapter INTEGER NOT NULL DEFAULT 1,
  is_second_cycle INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE completed_tasks (
  id TEXT PRIMARY KEY,
  chapter INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE flowers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  pollinated INTEGER NOT NULL DEFAULT 0,
  fruiting INTEGER NOT NULL DEFAULT 0,
  nectar_amount REAL NOT NULL DEFAULT 1.0
);

CREATE TABLE nest (
  id TEXT PRIMARY KEY DEFAULT 'main',
  x REAL,
  y REAL,
  wax_cells INTEGER NOT NULL DEFAULT 0,
  pollen_storage REAL NOT NULL DEFAULT 0,
  nectar_storage REAL NOT NULL DEFAULT 0,
  eggs INTEGER NOT NULL DEFAULT 0,
  larvae INTEGER NOT NULL DEFAULT 0,
  cocoons INTEGER NOT NULL DEFAULT 0,
  workers INTEGER NOT NULL DEFAULT 0,
  drones INTEGER NOT NULL DEFAULT 0,
  young_queens INTEGER NOT NULL DEFAULT 0,
  honey_pot REAL NOT NULL DEFAULT 0
);
```

### TypeScript Interfaces

```typescript
interface WorldState {
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  dayProgress: number
  flowers: FlowerState[]
  nest: NestState
  chapter: number
  completedTasks: string[]
  isSecondCycle: boolean
}

interface FlowerState {
  id: string
  type: 'crocus' | 'clover' | 'lavender' | 'foxglove' | 'snapdragon'
  position: { x: number, y: number }
  pollinated: boolean
  fruiting: boolean
  nectarAmount: number
}

interface NestState {
  location: { x: number, y: number } | null
  waxCells: number
  pollenStorage: number
  nectarStorage: number
  eggs: number
  larvae: number
  cocoons: number
  workers: number
  drones: number
  youngQueens: number
  honeyPot: number
}

interface BumblebeeState {
  role: 'queen' | 'worker' | 'drone' | 'young-queen'
  energy: number          // 0-1, visuell = Koerperfuelle
  pollenLoad: number      // 0-1, visuell = Pollenhoeschen
  nectarLoad: number      // 0-1, visuell = langsamerer Flug
  bodyTemperature: number // 0-1, visuell = Farbleuchtkraft
}

interface Chapter {
  id: number
  season: Season
  tasks: Task[]
  unlockCondition: () => boolean
  cutsceneOnStart?: CutsceneData
  cutsceneOnEnd?: CutsceneData
}

interface Task {
  id: string
  scene: string
  completionCheck: () => boolean
  onComplete: (world: WorldState) => WorldState
}

interface CutsceneData {
  frames: CutsceneFrame[]
}

interface CutsceneFrame {
  spritesheet: string
  animation: string
  duration: number
}
```

## Implementierungs-Reihenfolge

1. Extension-Scaffold (Nuxt + Phaser Setup)
2. Overworld mit Einhorn-Bewegung + Jahreszeiten
3. Hummel Kapitel 1-3 (Erwachen, Nestsuche, erste Brut)
4. Cutscene-System fuer Entwicklungssequenzen
5. Hummel Kapitel 4-6 (Arbeiterinnen, Sammeln, Gefahren)
6. Hummel Kapitel 7-8 (Neue Generation, Winterruhe)
7. Audio-Integration
8. Zweiter Durchlauf (haertere Konsequenzen)

## Zukuenftige Erweiterungen

- **Honigbiene:** Schwarm-Gruendung, Alterspolyethismus, Schwaenzeltanz, Wintertraube
- **Hornisse:** Papier-Nestbau, Jagd auf andere Insekten, Perspektivwechsel zum "Fressfeind"
- **Weitere Oekosysteme:** Wald (Eichhoernchen, Specht), Teich (Frosch, Libelle), Berge
- **Naming-Konvention:** Alle Spiele als `haex-game-*` (haex-tetris wird umbenannt)
