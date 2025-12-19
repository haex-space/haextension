# Haextension

Monorepo für HaexVault Extensions - sichere, verschlüsselte Erweiterungen für deinen digitalen Tresor.

## Was ist Haextension?

Haextension ist eine Sammlung von Extensions für [HaexVault](https://haex.space), die deine sensiblen Daten Ende-zu-Ende verschlüsselt verwalten. Alle Extensions nutzen das gleiche Sicherheitsmodell und die gemeinsame UI-Bibliothek `haex-ui`.

## Extensions

### haex-pass - Passwort-Manager

Ein moderner Passwort-Manager, inspiriert von KeePass - aber besser.

**Features:**
- KeePass-kompatibel (KDBX Import)
- Konsistente UI auf allen Geräten
- Responsive Design
- Fuzzy-Suche für schnellen Zugriff
- Automatische Synchronisation via HaexSpace
- TOTP-Unterstützung (2FA)
- Ende-zu-Ende-Verschlüsselung

**Installation:** [haex-pass im Marketplace](https://haex.space/marketplace/haex-pass)

### haex-pass-browser - Browser-Extension

Browser-Extension für haex-pass zum automatischen Ausfüllen von Login-Formularen.

**Features:**
- Sichere WebSocket-Verbindung zu HaexVault
- Automatische Erkennung von Login-Formularen
- Ein-Klick Autofill
- Multi-Browser-Support (Chrome, Firefox, Chromium-basiert)
- Keine Datensammlung - alles bleibt lokal

**Installation:**
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/haex-pass/)
- **Chrome/Chromium:** [Releases](https://github.com/haex-space/haextension/releases) herunterladen und als "unpacked extension" laden

### haex-files - E2E-verschlüsselter File-Sync (in Entwicklung)

Ende-zu-Ende-verschlüsselter, geräteübergreifender Dateisync.

**Geplante Features:**
- E2E-verschlüsselter File-Sync
- Multi-Backend-Support (S3, Cloudflare R2, MinIO)
- Automatische Synchronisation
- Selective Sync für Mobile
- Konfliktfreier Multi-Device-Sync (CRDT)

## Projektstruktur

```
haextension/
├── apps/
│   ├── haex-pass/           # Passwort-Manager Extension
│   ├── haex-pass-browser/   # Browser-Extension für Autofill
│   └── haex-files/          # File-Sync Extension (WIP)
└── packages/
    └── haex-ui/             # Shared UI-Komponenten (shadcn-vue basiert)
```

## Schnellstart

### Voraussetzungen

- Node.js 18+ (22+ empfohlen)
- pnpm 9+
- Git

### Installation

```bash
# Repository klonen
git clone https://github.com/haex-space/haextension.git
cd haextension

# Dependencies installieren
pnpm install
```

### Development

```bash
# haex-pass entwickeln
pnpm --filter haex-pass dev

# haex-files entwickeln
pnpm --filter haex-files dev

# haex-pass-browser entwickeln (Chrome)
pnpm --filter haex-pass-browser dev

# haex-pass-browser entwickeln (Firefox)
pnpm --filter haex-pass-browser dev-firefox
```

### Build

```bash
# haex-pass bauen und signieren
pnpm --filter haex-pass build:release

# haex-files bauen und signieren
pnpm --filter haex-files build:release

# haex-pass-browser für Chrome bauen
pnpm --filter haex-pass-browser build
pnpm --filter haex-pass-browser pack:zip

# haex-pass-browser für Firefox bauen
EXTENSION=firefox pnpm --filter haex-pass-browser build
pnpm --filter haex-pass-browser pack:xpi
```

## Nutzung der Extensions

### haex-pass

1. **Installation:**
   - Öffne HaexVault auf deinem Gerät
   - Navigiere zum Marketplace
   - Installiere "haex-pass"

2. **KeePass-Import:**
   - Öffne haex-pass in HaexVault
   - Klicke auf "Importieren"
   - Wähle deine `.kdbx`-Datei
   - Gib das Master-Passwort ein

3. **Einträge erstellen:**
   - Klicke auf "+" für einen neuen Eintrag
   - Fülle Titel, Benutzername, Passwort aus
   - Optional: URL, Notizen, TOTP hinzufügen
   - Speichern

4. **Suche:**
   - Nutze die Suchleiste für Fuzzy-Suche
   - Tippe einen Teil des Titels oder Benutzernamens

### haex-pass-browser

1. **Setup:**
   - Installiere die Browser-Extension (siehe oben)
   - Starte HaexVault auf deinem Computer
   - Klicke auf das haex-pass Icon in der Browser-Toolbar

2. **Verbindung herstellen:**
   - Klicke "Verbinden" im Extension-Popup
   - Bestätige die Verbindung in HaexVault
   - Die Verbindung bleibt für zukünftige Sessions gespeichert

3. **Autofill nutzen:**
   - Navigiere zu einer Login-Seite
   - Klicke auf das haex-pass Icon im Eingabefeld
   - Wähle den gewünschten Eintrag
   - Benutzername und Passwort werden automatisch ausgefüllt

4. **Einstellungen:**
   - Klicke auf das Zahnrad-Icon im Popup
   - **Sprache:** Auto, Deutsch oder Englisch
   - **WebSocket-Port:** Standard 19455 (nur ändern wenn nötig)

### haex-files (Preview)

> **Hinweis:** haex-files befindet sich noch in aktiver Entwicklung.

1. **Sync-Regel erstellen:**
   - Öffne haex-files in HaexVault
   - Wähle einen lokalen Ordner
   - Konfiguriere das Storage-Backend (S3, R2, MinIO)

2. **Backend-Konfiguration:**
   - Unterstützte Backends: S3, Cloudflare R2, MinIO
   - Credentials werden verschlüsselt gespeichert
   - Verbindungstest vor Aktivierung

## Architektur

### Security-Modell

Alle Extensions nutzen das HaexVault Security-Modell:

- **Lokale Verschlüsselung:** SQLCipher mit Vault-Passwort
- **Sync-Verschlüsselung:** Alle Daten werden vor dem Sync E2E-verschlüsselt
- **Key-Hierarchie:** Extension Master-Key → Space-Keys → File-Keys
- **Zero-Knowledge:** Server sieht niemals Klartext-Daten

### Extension-Modi

Extensions können in zwei Modi laufen:

1. **iframe-Modus (Mobile/Web):**
   - Extension läuft im iframe
   - Kommunikation via `postMessage`

2. **Native WebView-Modus (Desktop):**
   - Extension in eigenem Tauri-Fenster
   - Kommunikation via Tauri `invoke()`

### Tech-Stack

- **Frontend:** Vue 3, Nuxt 4, TypeScript
- **UI:** shadcn-vue, Tailwind CSS, Reka UI
- **State:** Pinia
- **Build:** Vite
- **SDK:** @haex-space/vault-sdk
- **Backend:** Rust (Tauri)

## Development Guide

### Extension entwickeln

1. **Neues Projekt erstellen:**
   ```bash
   mkdir apps/meine-extension
   cd apps/meine-extension
   npx nuxi init .
   ```

2. **haex-ui einbinden:**
   ```bash
   # In package.json
   "dependencies": {
     "@haex-space/vault-sdk": "^2.5.34",
     "shadcn-nuxt": "2.3.2"
   }
   ```

3. **Extension-Manifest:**
   ```bash
   mkdir haextension
   # haextension.config.json erstellen
   ```

4. **SDK nutzen:**
   ```typescript
   import { useHaexVault } from '@haex-space/vault-sdk'

   const client = useHaexVault()

   // Datenbank-Operationen
   const results = await client.db.selectAsync({
     sql: 'SELECT * FROM my_table'
   })

   // Dateisystem
   const files = await client.filesystem.readDirAsync('/path')
   ```

### Tests ausführen

```bash
# haex-pass Tests
pnpm --filter haex-pass test

# haex-files Tests
pnpm --filter haex-files test

# Alle Tests
pnpm test
```

### Versioning

Extensions nutzen semantisches Versioning:

```bash
# Patch-Release (1.0.0 → 1.0.1)
pnpm --filter haex-pass build:patch

# Minor-Release (1.0.0 → 1.1.0)
pnpm --filter haex-pass build:minor

# Major-Release (1.0.0 → 2.0.0)
pnpm --filter haex-pass build:major
```

## Beitragen

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/mein-feature`)
3. Committe deine Änderungen (`git commit -m 'feat: Mein neues Feature'`)
4. Push zum Branch (`git push origin feature/mein-feature`)
5. Erstelle einen Pull Request

### Commit-Konventionen

- `feat:` - Neue Features
- `fix:` - Bugfixes
- `chore:` - Maintenance
- `docs:` - Dokumentation
- `refactor:` - Code-Refactoring

## Links

- [HaexVault](https://haex.space)
- [HaexVault SDK](https://github.com/haex-space/vault-sdk)
- [Marketplace](https://haex.space/marketplace)
- [Dokumentation](https://docs.haex.space)

## Lizenz

MIT
