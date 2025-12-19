# haex-files

E2E-verschlüsselter, geräteübergreifender Dateisync für HaexVault.

## Warum haex-files?

Cloud-Storage ist praktisch, aber deine Daten liegen unverschlüsselt auf fremden Servern. haex-files löst das:

- **Ende-zu-Ende-Verschlüsselung:** Nur du kannst deine Dateien lesen
- **Multi-Backend:** Nutze deinen eigenen S3, Cloudflare R2, oder MinIO
- **Multi-Device:** Automatische Synchronisation zwischen allen Geräten
- **Zero-Knowledge:** Der Server sieht niemals Dateinamen oder Inhalte

## Features

- E2E-verschlüsselter File-Sync
- Multi-Backend-Support (S3, Cloudflare R2, MinIO)
- Automatische Synchronisation
- Selective Sync für Mobile
- Konfliktfreier Multi-Device-Sync (CRDT mit HLC)
- Chunk-basiertes Streaming für große Dateien

## Status

> **Preview:** haex-files befindet sich in aktiver Entwicklung.

**Abgeschlossen:**
- Projektstruktur und SDK-Integration
- Backend-Modul in HaexVault
- Datenbank-Schema
- Key-Management (Master-Key → Space-Keys → File-Keys)
- Storage Backend Abstraktion (S3-kompatibel)
- Sync-Rules Verwaltung
- Lokales Verzeichnis-Scanning

**In Arbeit:**
- Storage Backend Integration (Test-Connection)
- File System Watcher für automatische Updates
- Upload/Download-Flow

## Installation

haex-files ist als Extension für [HaexVault](https://haex.space) verfügbar:

**[haex-files im Marketplace](https://haex.space/marketplace/haex-files)** *(Coming Soon)*

## Nutzung

### 1. Backend konfigurieren

Bevor du Dateien synchronisieren kannst, musst du ein Storage-Backend einrichten.

**Unterstützte Backends:**
- **AWS S3** - Amazon Simple Storage Service
- **Cloudflare R2** - S3-kompatibel, keine Egress-Kosten
- **MinIO** - Self-hosted S3-kompatibler Storage

**Konfiguration:**

1. Öffne haex-files in HaexVault
2. Gehe zu "Einstellungen" → "Backends"
3. Klicke "Backend hinzufügen"
4. Wähle den Backend-Typ
5. Gib die Credentials ein:
   - **Endpoint:** z.B. `s3.eu-central-1.amazonaws.com` oder deine MinIO-URL
   - **Bucket:** Name des Buckets
   - **Access Key ID:** Dein Access Key
   - **Secret Access Key:** Dein Secret Key
   - **Region:** z.B. `eu-central-1`
6. Klicke "Verbindung testen"
7. Bei Erfolg: "Speichern"

> **Sicherheit:** Alle Credentials werden mit deinem Vault-Key verschlüsselt gespeichert.

### 2. Sync-Regel erstellen

Eine Sync-Regel verbindet einen lokalen Ordner mit einem Backend.

1. Klicke "Neue Sync-Regel"
2. Wähle einen lokalen Ordner (z.B. `~/Documents/Encrypted`)
3. Wähle das Backend
4. Optional: Filter konfigurieren (z.B. nur `*.pdf`)
5. Speichern

### 3. Dateien synchronisieren

Nach dem Erstellen einer Sync-Regel:

- **Automatisch:** Dateien werden bei Änderungen synchronisiert
- **Manuell:** Klicke "Sync starten" für sofortige Synchronisation

**Sync-Status:**
- Grün: Alles synchronisiert
- Gelb: Sync läuft
- Rot: Fehler (Klicke für Details)

### 4. Multi-Device

haex-files synchronisiert automatisch zwischen allen deinen Geräten:

1. Installiere haex-files auf dem zweiten Gerät
2. Melde dich mit demselben HaexVault-Account an
3. Die Sync-Regeln und Dateien werden automatisch synchronisiert

**Konflikte:**
- Bei gleichzeitiger Bearbeitung: Last-Writer-Wins
- Option: Beide Versionen behalten (Conflict-Copy)

## Architektur

### Verschlüsselung

```
Extension Master-Key (in verschlüsselter DB)
        ↓ wrap
Space-Keys (pro "Space"/Ordner)
        ↓ wrap
File-Keys (pro Datei)
        ↓
File Content (XChaCha20Poly1305)
```

**Jede Datei hat einen eigenen Key.** Das ermöglicht:
- Granulare Zugriffskontrolle
- Sicheres Sharing einzelner Dateien
- Key-Rotation ohne komplettes Re-Encrypt

### Chunk-Streaming

Große Dateien werden in Chunks verarbeitet:

- **Chunk-Größe:** 5 MB (konfigurierbar)
- **Jeder Chunk:** Eigener Nonce, eigener Auth-Tag
- **Vorteil:** Kein RAM-Problem bei großen Dateien

### CRDT-Sync

Multi-Device-Sync nutzt CRDTs (Conflict-free Replicated Data Types):

- **Hybrid Logical Clock (HLC):** Kausale Ordnung ohne zentrale Zeit
- **Last-Writer-Wins:** Bei echten Konflikten gewinnt die neueste Änderung
- **Idempotent:** Sync-Operationen können sicher wiederholt werden

## Development

### Voraussetzungen

- Node.js 22+
- pnpm 9+
- HaexVault Development-Setup

### Setup

```bash
# Repository klonen
git clone https://github.com/haex-space/haextension.git
cd haextension

# Dependencies installieren
pnpm install

# Development Server starten
cd apps/haex-files
pnpm dev
```

### Projekt-Struktur

```
apps/haex-files/
├── app/
│   ├── pages/              # Nuxt Seiten
│   │   └── index.vue       # Hauptseite (File-Browser)
│   ├── components/         # Vue Komponenten
│   │   ├── drawer/         # Drawer-Komponenten (Backend, Rules)
│   │   └── ...
│   ├── stores/             # Pinia Stores
│   │   ├── files.ts        # Dateien und Navigation
│   │   ├── syncRules.ts    # Sync-Regeln
│   │   └── backends.ts     # Storage Backends
│   └── composables/        # Vue Composables
├── haextension/            # Extension-Manifest
│   ├── haextension.config.json
│   └── manifest.json
└── nuxt.config.ts
```

### SDK-API

haex-files nutzt das `@haex-space/vault-sdk`:

```typescript
import { useHaexVault } from '@haex-space/vault-sdk'

const client = useHaexVault()

// Backends
const backends = await client.filesync.listBackendsAsync()
await client.filesync.addBackendAsync({ type: 's3', name: 'My S3', config: {...} })
await client.filesync.testBackendAsync(backendId)

// Sync-Rules
const rules = await client.filesync.listSyncRulesAsync()
await client.filesync.addSyncRuleAsync({ localPath: '/path', backendId, name: 'My Sync' })

// Lokale Dateien scannen
const files = await client.filesync.scanLocalAsync({ ruleId })

// Sync
await client.filesync.triggerSyncAsync()
const status = await client.filesync.getSyncStatusAsync()
```

### Build

```bash
# Production Build
pnpm build

# Build und Signieren für Marketplace
pnpm build:release

# Version erhöhen und Release
pnpm build:patch   # 0.1.0 → 0.1.1
pnpm build:minor   # 0.1.0 → 0.2.0
pnpm build:major   # 0.1.0 → 1.0.0
```

### Tests

```bash
# Unit Tests
pnpm test

# Type-Check
pnpm typecheck
```

## Tech-Stack

- **Vue 3** - UI Framework mit Composition API
- **Nuxt 4** - Meta-Framework für Vue
- **TypeScript** - Type Safety
- **Tailwind CSS** - Styling
- **Pinia** - State Management
- **shadcn-vue / Reka UI** - UI Komponenten
- **@haex-space/vault-sdk** - HaexVault Kommunikation
- **drizzle-orm** - Type-safe SQL

## Roadmap

- [ ] Storage Backend Test-Connection
- [ ] File System Watcher (Desktop)
- [ ] Upload/Download Flow
- [ ] Chunked Transfer für große Dateien
- [ ] Progress-Reporting
- [ ] Selective Sync UI
- [ ] Conflict Resolution UI
- [ ] Google Drive Backend
- [ ] Dropbox Backend

## Lizenz

MIT
