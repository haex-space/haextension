# haex-notes: Teilen & Importieren — Design

**Datum:** 2026-07-21
**Status:** Design (validiert im Brainstorming, bereit für Implementierungsplan)
**Repos:** `haex-vault` (Plattform), `haex-vault-sdk` (SDK), `haextension/apps/haex-notes` (Extension)

## Ziel

Schüler sollen auswählen können, welche Notizen/Unterlagen sie über **Spaces** mit anderen teilen. Zwei-Stufen-Modell:

1. **Read-only teilen:** Andere Mitglieder eines Space sehen das geteilte Notizbuch inkl. der geteilten Seiten (nur lesen). Es ist erkennbar, **von wem** das Notizbuch stammt (Autor-Name).
2. **Import als Kopie:** Bei Bedarf markiert der Empfänger einzelne Seiten oder alle und kopiert sie in ein **eigenes** Notizbuch → eigene, voll bearbeitbare Records. Er kann die Kopie anschließend selbst teilen.

Das Import-Modell umgeht bewusst das gemeinsame Bearbeiten derselben Notiz (collaborative-Flag) — statt fremde read-only-Records zu editieren, arbeitet man an einer eigenen Kopie.

## Verifizierter Plattform-Stand (Grundlage)

Alle Punkte am Code verifiziert (SDK 3.3.0, haex-vault, haex-calendar als Referenz):

- **Space-Infrastruktur existiert** (MLS-verschlüsselt, UCAN-Capabilities, iroh-P2P). Space anlegen/beitreten/einladen passiert in **haex-vault**, nicht in der Extension.
- **Row-genaues Teilen** via `sdk.spaces`:
  - `listSpacesAsync(): DecryptedSpace[]` — `{ id, name, originUrl, createdAt, capabilities[] }`
  - `assignAsync(SpaceAssignment[])`, `unassignAsync(...)`, `assignRowAsync/unassignRowAsync`
  - `getAssignmentsAsync(tableName, rowPks?)`
  - `SpaceAssignment = { tableName, rowPks, spaceId, groupId?, type?, label? }`
- **Assignment-Zeilen synchronisieren mit:** `haex_shared_space_sync` steht in `SHARED_SPACE_BUILTIN_TABLES` (`kind: spaceIdColumn`). Empfänger erhalten die Assignments und sehen sie via `getAssignmentsAsync`.
- **Read-only wird am Sync-Layer erzwungen:** `useChangeValidator` lehnt Änderungen an fremden Records ab, außer `collaborative=true`. Die Push-Seite setzt `collaborative` nie → geteilte Records sind für andere faktisch read-only. Die Extension braucht dafür **keine** eigene Enforcement-Logik.
- **Extension-Isolation ist strukturell:** Der Host-Handler hängt an jeden `sdk.spaces.*`-Call `publicKey`/`name` der Extension ([`handlers/spaces.ts`](../../haex-vault/src/composables/handlers/spaces.ts)); Assignments sind per `(extensionPublicKey, extensionName)` getrennt.
- **`spaces`-Permission wird erzwungen** (echter Prompt-Typ in `usePermissionPrompt.ts`). Sie dient auch als Nutzer-Einwilligung (Daten off-device schieben, fremde DIDs/Member sehen), nicht nur der Isolation → **bleibt bestehen**.
- **Transport (verifiziert):** Member-to-member-Sync läuft über **Cloud-Sync** (Server-Backend der Online-Spaces), nicht QUIC/P2P. Der Cloud-Push scannt Extension-Tabellen via INNER JOIN mit `haex_shared_space_sync` ([`tableScanner.ts:306`](../../haex-vault/src/stores/sync/tableScanner.ts)) **und** pusht `haex_shared_space_sync` selbst als Builtin-Shared-Space-Tabelle ([`push.ts:205-219`](../../haex-vault/src/stores/sync/orchestrator/push.ts)). Beide erreichen andere Member. QUIC liefert Extension-Daten **nicht** → Notes-Sharing ist **Online-Space-only** (Schüler-Fall: Sync-Server ✓).
- **Signatur + Capability-Ingest existiert bereits (Sicherheitsmodell erfüllt):** [`pull/apply.ts:48-163`](../../haex-vault/src/stores/sync/orchestrator/pull/apply.ts) `verifyPulledChangesAsync` verifiziert **jede** Change-Signatur (Ed25519, `signedBy`) und prüft **UCAN `space/write`** des Signierers; sonst wird der ganze Batch abgelehnt. Gilt für `haex_shared_space_sync` mit. → Nur-Lese-Member können keine gültigen Assignments einschleusen. Push signiert mit space-spezifischer Identität ([`push.ts:411`](../../haex-vault/src/stores/sync/orchestrator/push.ts)). **Kein Neubau — nur nutzen.**
- **Autor-Attribution — verbleibende Lücke:** `signedBy` wird beim Ingest verifiziert, aber **nicht** als abfragbare Spalte persistiert; `haex_shared_space_sync` hat kein `authored_by_did`. Das SDK hat keine Identitäten-/Kontakte-API. `getSpaceMembersAsync(spaceId)` existiert host-seitig ([`stores/spaces/index.ts`](../../haex-vault/src/stores/spaces/index.ts)), ist aber nicht via SDK exposed. → Phase A ergänzt genau diese zwei Dinge.

### Referenz-Implementierung

haex-calendar ist die 1:1-Blaupause für das Teilen:
- [`app/stores/calendars.ts`](../../apps/haex-calendar/app/stores/calendars.ts) — `shareCalendarWithSpaceAsync`/`unshareCalendarFromSpaceAsync` (Parent + Kinder, groupId), `getCalendarAssignmentsAsync`
- [`app/stores/events.ts`](../../apps/haex-calendar/app/stores/events.ts) (~Z. 205) — neue Kind-Zeilen erben Assignment automatisch
- [`app/components/calendar/ShareDialog.vue`](../../apps/haex-calendar/app/components/calendar/ShareDialog.vue) — Space-Liste gefiltert auf `space/write`|`space/admin`, Toggle pro Space

## Design-Entscheidungen (validiert)

| # | Entscheidung | Wahl |
|---|---|---|
| 1 | Granularität | Ganzes Notizbuch **und** einzelne Seiten |
| 2 | Nutzungsmodell | Read-only teilen + Import-als-Kopie (kein In-Place-Co-Editing) |
| 3 | Einzelseiten-Teilen | Seite **+ Notizbuch-Kontext** (Notizbuch-Zeile mitteilen, nur die eine Seite) |
| 4 | Autor-Erkennung | **Signierter** Assignment-Eintrag (`haex_shared_space_sync`): Signatur + Signierer-DID (= space-spezifische DID). Empfangsseitig capability-validiert (siehe Sicherheitsmodell unten) |
| 5 | DID→Name | Neue SDK-API `sdk.spaces.getMembersAsync(spaceId)` (DID + Label, eigenes Member markiert); Fallback: gekürzte DID |
| 6 | `spaces`-Permission | Bleibt (Einwilligung); haex-notes deklariert sie |
| 7 | Read-only-Signal (Empfänger) | Assignment vorhanden **und** Autor-DID ≠ **eigener space-spezifischer DID** → read-only |

**DID-Modell (wichtig):** Ein User kann mehrere Identitäten haben. In einem Space ist er unter **genau einer** DID Mitglied — der Identität, die dem Space-Sync-Backend zugeordnet ist (`haexSyncBackends.identityId` für die `spaceId`; = `haexSpaceMembers.identityId`). Alle Daten, die in einen Space geteilt werden, werden **immer** unter dieser space-spezifischen DID signiert ([`push.ts`](../../haex-vault/src/stores/sync/orchestrator/push.ts) signiert mit `backend.identityId` → `identity.did`). Die Assignment-Signatur **muss** diesem `signedBy` entsprechen. `ownIdentities[0]` ist explizit **falsch**.

**Sicherheitsmodell für Assignments (`haex_shared_space_sync`):** Assignments reisen member-to-member und tragen die Autorschaft. Anforderungen:
1. **Signiert:** Jeder Assignment-Eintrag ist mit der space-spezifischen DID seines Erstellers signiert (Signatur + Signierer-DID), fälschungssicher — nicht bloß eine lose `authored_by_did`-Spalte.
2. **Capability-validierter Ingest:** Beim Empfang entscheidet Signatur + Space-Capability des Signierers, **ob die Zeile überhaupt in die eigene Vault übernommen wird**. Nur Signierer mit `space/write`|`space/admin` erzeugen gültige Assignments.
3. **Read-only kann nichts einschleusen:** Ein von einem Nur-Lese-Member (Capability `read`) signierter Assignment-Eintrag ist **niemals gültig** und wird vom Sync ausgeschlossen. Da das Assignment die Zuordnung „Zeile → Space" ist, verhindert das, dass ein Leser Daten in den Space einschleust.

Mechanik: analog zum bestehenden Record-Signing (`signRecordAsync`/`verifyRecordSignatureAsync`) und der Ingest-Validierung (`useChangeValidator`/inbound-Validierung im Rust-Layer). Genauer Delta (was existiert vs. zu bauen) wird über den Rust-Sync-Spike bestimmt.

## Architektur & Datenfluss

```
Sender (Schüler A)                 Space S (MLS/iroh)            Empfänger (Schüler B)
─────────────────                  ──────────────────            ─────────────────────
notebooks/pages (eigene)                                          notebooks/pages (Kopien in DB)
   │ assignAsync(notebook+pages)                                     ▲
   ▼                                                                 │ pull (read-only)
haex_shared_space_sync  ──── sync (verschl., signiert) ─────────►  haex_shared_space_sync
   (+ authored_by_did = A.did)                                       (authored_by_did = A.did)
                                                                     │
                                                        getAssignmentsAsync → shared-Set
                                                        getMembersAsync → A.did → "Anna M."
                                                        authored_by_did ≠ B.did → read-only-Badge
                                                                     │ Import
                                                                     ▼
                                                        neue notebooks/pages-Zeilen (eigene, editierbar)
```

---

## Phase A — Plattform (haex-vault + SDK)

Voraussetzung für Autor-Attribution. Ohne Phase A ist Empfänger-seitig kein „von wem"/read-only möglich.

### A1. Schema: `authored_by_did` auf `haex_shared_space_sync`

- **haex-vault** `src/database/schemas/spaces.ts`: Spalte `authoredByDid` (nullable) zu `haexSharedSpaceSync` ergänzen (analog zu `haexSpaceMembers.authoredByDid`).
- `src/database/tableNames.json`: `shared_space_sync.columns.authoredByDid = "authored_by_did"`.
- Migration generieren.
- **Verify:** Migration idempotent; Bestandszeilen haben `authored_by_did = NULL`.

### A2. Assignment-Erstellung befüllt `authored_by_did` (space-spezifische DID)

- Dort, wo Assignment-Zeilen in `haex_shared_space_sync` geschrieben werden (Tauri/Rust-Backend hinter `sdk.spaces.assignAsync`, angestoßen über [`handlers/spaces.ts`](../../haex-vault/src/composables/handlers/spaces.ts)), `authored_by_did` = **space-spezifische DID** des Autors setzen: die Identität, unter der der User in diesem Space Mitglied ist. Auflösung über `spaceId` → Space-Sync-Backend (`haexSyncBackends.identityId`) → `identity.did`, bzw. `haexSpaceMembers.identityId` für die eigene Membership.
- **Nicht** `ownIdentities[0]` verwenden. Der Wert muss dem `signedBy` entsprechen, das der Push für Daten-Zeilen in diesen Space nutzt ([`push.ts`](../../haex-vault/src/stores/sync/orchestrator/push.ts): `backend.identityId` → `didKeyToPublicKeyAsync(identity.did)`).
- Wert reist als normale Spalte über den CRDT-Sync → beim Empfänger vorhanden.
- **Verify:** Nach `assignAsync` hat die Assignment-Zeile die space-spezifische DID; sie stimmt mit dem `signedBy` der zugehörigen Daten-Push-Changes überein; nach Sync beim Empfänger identisch.

### A3. SDK: `authoredByDid` auf `SpaceAssignment` + `getAssignmentsAsync`

- **haex-vault-sdk**: `SpaceAssignment` um `authoredByDid?: string` erweitern; `getAssignmentsAsync` gibt die Spalte zurück.
- Host-Handler: Feld in der Response durchreichen.
- **Verify:** `getAssignmentsAsync` liefert `authoredByDid` für synchronisierte Assignments.

### A4. SDK: `sdk.spaces.getMembersAsync(spaceId)`

- **haex-vault-sdk** `SpacesAPI`: `getMembersAsync(spaceId): Promise<SpaceMemberInfo[]>` (mind. `{ did/publicKey, label, isSelf }`). Das **`isSelf`-Flag** markiert die eigene space-spezifische Membership → liefert dem Empfänger seine eigene DID in diesem Space (für die Read-only-Regel), ohne Sync-Backends zu exponieren.
- **haex-vault** Handler-Command, backed by bestehendes `getSpaceMembersAsync` ([`stores/spaces/index.ts`](../../haex-vault/src/stores/spaces/index.ts), joined `haex_space_members` ⋈ `haex_identities`). Eigene Membership über `haexSyncBackends.identityId`/`ownIdentities` bestimmen und als `isSelf` markieren. Nur Member der eigenen Spaces, kein Server-Call.
- Permission: unter bestehender `spaces`-Permission abhandeln.
- **Verify:** Extension in Space S erhält Member-Liste mit Labels; genau ein Member hat `isSelf=true` und dessen DID = space-spezifische DID; Nicht-Member-Call schlägt fehl/leer.

---

## Phase B — haex-notes: Teilen (read-only) + Autor-Anzeige

### B1. Manifest

`apps/haex-notes/haextension/manifest.json` → `permissions.spaces = [{ "target": "*", "operation": "readWrite" }]` (Format wie haex-calendar).

### B2. Schema

- Migration: `space_id` (nullable) auf `notebooks`. Bedeutung: **„ganzes Notizbuch geteilt" (künftige Seiten erben)**. Einzelseiten-Teilen setzt diese Spalte **nicht**.
- Keine Spalte auf `pages` — geteilte Seiten werden aus `getAssignmentsAsync(PAGES_TABLE)` abgeleitet.

### B3. Store `app/stores/spaces.ts` (Spiegel von calendars.ts)

- `FULL_NOTEBOOKS_TABLE` / `FULL_PAGES_TABLE` via `getTableName(publicKey, pkgName, ...)`.
- `getNotebookAssignmentsAsync(notebookId)`.
- `shareNotebookWithSpaceAsync(notebookId, spaceId)`: Notizbuch-Zeile + **alle** Seiten zuweisen (`groupId = notebookId`, `type="Notebook"`, `label=name`); `notebooks.space_id = spaceId`.
- `sharePagesWithSpaceAsync(notebookId, pageIds[], spaceId)`: Notizbuch-Zeile (Kontext) + gewählte Seiten (`groupId = notebookId`); `notebooks.space_id` bleibt unverändert.
- `unshareNotebookFromSpaceAsync` / `unsharePagesFromSpaceAsync`: passendes `unassignAsync`, `space_id` neu berechnen.
- Auto-Inherit: In der bestehenden „Seite anlegen"-Aktion (pages/notebook-Store) prüfen, ob `notebooks.space_id` gesetzt ist; falls ja, neue Seite via `assignAsync` demselben Space/`groupId` zuweisen (Muster: events.ts ~Z. 205).

### B4. Share-UI

- `app/components/notes/ShareDialog.vue` (Port von calendar): `listSpacesAsync()` gefiltert auf `capabilities` `space/write`|`space/admin`; Toggle pro Space; Leerzustand verweist auf Vault-Einstellungen.
- Einstiegspunkte: Notizbuch-Kontextmenü „Teilen"; Seiten-Kontextmenü/Auswahlmodus „Seite(n) teilen".
- Badge auf geteilten Notizbüchern/Seiten (aus Assignments abgeleitet).

### B5. Empfänger-Ansicht (read-only + Autor)

- Beim Laden: `getAssignmentsAsync(NOTEBOOKS_TABLE)` + `(PAGES_TABLE)` → Map `rowPk → { spaceId, authoredByDid }`. Pro relevantem Space `getMembersAsync(spaceId)` → Label-Map + **eigener space-spezifischer DID** (Member mit `isSelf=true`).
- **Read-only-Regel (Entscheidung 7):** Assignment vorhanden **und** `authoredByDid ≠ eigener space-spezifischer DID` (aus `isSelf`) → read-only. Canvas nur Ansicht, Werkzeuge deaktiviert, Badge „Geteilt · Nur lesen".
- **Autor-Anzeige:** `authoredByDid` über die Label-Map auflösen → „Geteilt von {Name}". Fallback: gekürzte DID.
- Member-Liste inkl. Self-DID pro Space cachen (nicht pro Zeile abfragen).

---

## Phase C — haex-notes: Import als Kopie

### C1. Auswahl

Im geteilten (read-only) Notizbuch: Auswahlmodus in der Seitenliste — einzelne Seiten oder „Alle auswählen".

### C2. Import-Flow

- Aktion „In mein Notizbuch importieren" → Ziel wählen: bestehendes **eigenes** Notizbuch oder **neues** Notizbuch.
- Neues Notizbuch: neue UUID, Name z.B. „Kopie von {Name}", eigenes Cover; optional Autor als Herkunft im Namen/Notiz.
- Deep-Copy je Seite: **neue** `id` (UUID), Kopie von `strokes`, `tables`, `backgroundImage`, `thumbnail`, `template`, `orientation`; `notebookId = Ziel`; `pageNumber` fortlaufend angehängt; frische Timestamps; `deletedAt = null`.
- Kopien werden **nicht** zugewiesen (privat) → dem Importeur gehörend → voll bearbeitbar.

### C3. Verify

- Gewählte Seiten erscheinen als neue, bearbeitbare Zeilen im Ziel-Notizbuch.
- Originale (read-only, fremd) unverändert.
- Kopien haben kein Assignment (`getAssignmentsAsync` leer) → editierbar, nicht read-only.

---

## Verifikationskriterien (End-to-End)

**Sender:**
- Notizbuch teilen → Assignments für Notizbuch + alle Seiten (gemeinsame `groupId`), `authored_by_did` = eigene DID; `notebooks.space_id` gesetzt.
- Neue Seite im geteilten Notizbuch → automatisch zugewiesen.
- Einzelseite teilen → Notizbuch-Zeile + genau diese Seite zugewiesen; `notebooks.space_id` **nicht** gesetzt.
- Freigabe aufheben → alle betroffenen Assignments entfernt.

**Empfänger:**
- Geteiltes Notizbuch erscheint mit „Geteilt von {Name}" und read-only-Badge; Bearbeiten in der UI blockiert.
- Nur die tatsächlich geteilten Seiten sind sichtbar.

**Import:**
- Ausgewählte Seiten als neue, editierbare Zeilen im Ziel; Originale unberührt; Kopien ohne Assignment.

## Nicht im Scope

- Gemeinsames Bearbeiten derselben Notiz (`collaborative`-Flag durch alle Ebenen) — bewusst durch Import-als-Kopie ersetzt.
- Space anlegen/beitreten/einladen (haex-vault).
- Echtzeit-Cursor/Presence.
- Entfernen der `spaces`-Permission (separate Plattform-Entscheidung).

## ADRs

- **ADR-1 (Teilen = Row-Assignment, read-only am Sync-Layer):** Die Extension baut keine eigene Zugriffskontrolle; der Validator erzwingt read-only. Weniger Code, konsistent mit haex-calendar.
- **ADR-2 (Editieren via Import-Kopie statt collaborative):** Vermeidet die noch nicht verdrahtete Co-Editing-Kette und CRDT-Merge-Fragen bei Stroke-JSON. Nutzer arbeiten an eigenen, klar besessenen Kopien.
- **ADR-3 (Autor am Assignment, nicht pro Daten-Zeile):** Das Assignment repräsentiert „wer hat was geteilt" — eine DID pro geteilter Einheit. Geringster Plattform-Eingriff; kein Anfassen des Sync-Pfads jeder Extension-Tabelle.
- **ADR-6 (Assignments signiert + capability-validiert):** Assignment-Einträge sind mit der space-spezifischen DID signiert; der Ingest akzeptiert sie nur, wenn der Signierer `space/write`|`space/admin` hat. Verhindert, dass Nur-Lese-Member Daten in den Space einschleusen, und macht die Autorschaft fälschungssicher (Signatur statt loser Spalte).
- **ADR-4 (DID→Name via Space-Member):** `getMembersAsync` wiederverwendet bestehende Member-Labels und ist privacy-scoped (nur Member eigener Spaces) — enger als eine allgemeine Kontakte-API.
- **ADR-5 (`spaces`-Permission bleibt):** Sie ist Nutzer-Einwilligung fürs Off-device-Sharing, nicht nur Cross-Extension-Isolation (letztere ist bereits strukturell gelöst).

## Offene Risiken

- **Space-spezifische DIDs:** Author-Attribution und Read-only-Regel hängen an der korrekten space-spezifischen DID (nicht `ownIdentities[0]`). A2 muss die Autor-DID aus der Space-Membership/dem Sync-Backend auflösen und konsistent mit dem Push-`signedBy` halten; A4 muss die eigene Membership via `isSelf` markieren. Beide Punkte in Phase A verifizieren.
- **Mehrere Spaces pro Notizbuch:** `notebooks.space_id` ist einwertig (wie calendar). Quelle der Wahrheit sind die Assignments; die Spalte ist nur Marker für „vollständig geteilt + Auto-Inherit". Für v1 (meist 1 Space) ausreichend.
- **Reihenfolge:** Phase A muss vor Phase B/C ausgeliefert sein (SDK-Version-Bump), sonst fehlen `authoredByDid`/`getMembersAsync`.
