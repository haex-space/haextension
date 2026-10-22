# Data Model: haex-doom

Phase 1 of [plan.md](plan.md). Tables are Drizzle tables in the extension's own schema, named with the repository's prefix helper (`getTableName(publicKey, "haex-doom", name)`, as in `apps/haex-draw/app/database/schemas/index.ts`). Tables whose name ends in `_no_sync` stay on the device; the others sync between the user's devices. Binary columns are BLOBs passed as `{"$bytes": "<base64>"}` parameters and returned as base64.

## Game file

A playable base game. Bundled games are not stored: they are described by a constant list in the app (`app/lib/bundledGames.ts`) and loaded from `public/wads/*.wad.gz`.

**Table `game_files_no_sync`** (imported games only)

| Column | Type | Rules |
|---|---|---|
| `fingerprint` | text, primary key | SHA-256 of the file, lowercase hex. Unique (FR-024). |
| `title` | text | Recognised title, e.g. "DOOM II", "Final DOOM: TNT Evilution" (FR-023). |
| `family` | text | `doom1` (episodes E1–E4) or `doom2` (MAP01–MAP32); drives the engine's `-iwad` mode. |
| `file_name` | text | Name the engine sees in MEMFS (`doom2.wad`, `tnt.wad`, …), from the recognised title; the engine identifies the game by it. |
| `size` | integer | Bytes. |
| `imported_at` | text | ISO 8601. |

**Table `game_file_chunks_no_sync`**

| Column | Type | Rules |
|---|---|---|
| `fingerprint` | text | References `game_files_no_sync.fingerprint`; deleted with it (FR-025). |
| `index` | integer | 0-based; primary key together with `fingerprint`. |
| `data` | blob | 1 MiB except the last chunk. |

**Validation** (pure function in `app/lib/wad.ts`, before anything is stored, FR-022):

- At least 12 bytes; magic is `IWAD`. `PWAD` → rejected as "modification file, needs a base game".
- `numlumps` > 0; directory offset + 16 × `numlumps` ≤ file size; every lump's offset + size ≤ file size.
- Identification: known SHA-1 → exact title; otherwise `MAP01` present → `doom2` family ("DOOM II-compatible game"); `E1M1` present → `doom1` family (`E4M1` → "The Ultimate DOOM", `E2M1` → "DOOM", else "DOOM (shareware)"); neither → rejected.
- A bundled game's fingerprint or an existing fingerprint → "already available", nothing stored.

## Save game

**Table `saves`** (synced, FR-018)

| Column | Type | Rules |
|---|---|---|
| `id` | text, primary key | `<game_fingerprint>:<slot>`, deterministic, so the same slot saved on two devices is the same row and the sync keeps the later write (FR-046). |
| `game_fingerprint` | text | Fingerprint of the game file the save belongs to; for bundled games, the SHA-256 of the uncompressed WAD (constant in `bundledGames.ts`). |
| `slot` | integer | 0–7 (the engine's eight slots). Unique together with `game_fingerprint`. |
| `name` | text | Description the user typed in the save menu (read from the save header). |
| `data` | blob | The engine's `doomsavN.dsg` file. |
| `saved_at` | text | ISO 8601. |

- Saves are listed and restored only for the active game's fingerprint (US4 scenario 2).
- Writing is an upsert on `id` inside one statement, setting `saved_at` to the save time; after a sync conflict the most recently written row wins (FR-046; how the host's sync orders concurrent writes is verified in the task). A failed write leaves the previous row unchanged and is reported (FR-020).
- Saves of a removed imported game stay until the user deletes them (FR-025) and become visible again when the same file is imported again.

## Settings

Stored with the SDK's device-local `storage` API (strings, not synced; research R-8).

| Key | Value | Notes |
|---|---|---|
| `settings` | JSON `{ haptics: boolean, touchTurnSensitivity: number (0.25–4, default 1), lastGame: fingerprint \| null }` | Parsed and validated once on load; invalid or missing values fall back to the defaults. |
| `engine:crispy-doom.cfg` | text | Written by the engine (`M_SaveDefaults` hook); volumes, mouse sensitivity, key bindings live here and are edited in the engine's own menu (FR-017). |
| `engine:default.cfg` | text | Same. |

On first start, both config keys are absent and the bundled defaults (`engine/config/*.cfg`, WASD layout, research R-6) are written to MEMFS.

## Lobby (in memory, host and guests)

Not persisted. Lives in a Pinia store for the duration of a multiplayer session.

| Field | Type | Rules |
|---|---|---|
| `id` | text | UUID chosen by the host. |
| `role` | `host` \| `guest` | |
| `game` | `{ fingerprint, title }` | The host's chosen game. |
| `mode` | `coop` \| `deathmatch` | `deathmatch` maps to the engine's `-altdeath` ("2.0" rules, FR-027). |
| `monsters` | boolean | Deathmatch only; default `false` → `-nomonsters`. Coop always has monsters. |
| `timeLimit` | `0` \| `10` \| `20` | Deathmatch only, minutes; default `10` → `-timer 10`; `0` = no limit. |
| `visibility` | `contacts` \| `public` | Default `contacts` (FR-042). |
| `joinCode` | text | Issued by the host's vault when the lobby opens (FR-043); shown with a copy action. |
| `map` | text | `E1M1`-style or `MAP01`-style, matching the game's family. |
| `skill` | 1–5 | |
| `players` | list of `{ channelId, contactId \| null, displayName, verified, state, version }` | At most 3 guests (FR-027). `verified` = the player is one of the host's contacts; otherwise the name is self-chosen (FR-044). |

**Player state transitions**

```text
invited ──accept──▶ joined ──host starts──▶ playing ──leave/timeout──▶ left
   │                  │  ▲
   │                  │  └── join code (contacts-only: contacts; public: anyone)
   │                  ├──host removes──▶ removed   (cannot rejoin this lobby, FR-045)
   │                  └──fingerprint or version mismatch──▶ rejected   (FR-030)
   ├──decline──▶ declined
   └──not-installed / unreachable / expired──▶ failed
```

**Lobby state transitions**

```text
open ──start (≥ 1 guest joined)──▶ running ──host leaves / consistency failure──▶ ended
  └──host cancels──▶ ended
(the join code stops working when the lobby leaves `open`, FR-043)
```

## Invitations, lobbies and channels in the vault host

Specified by the host: `haex-space/haex-vault` @ `0e69e48563d9758a33d60c22460ce1414cb19e59` : `specs/057-extension-peer-channels/` `data-model.md`. haex-doom sees only the events and calls in [contracts/peers-api.md](contracts/peers-api.md); the invited player accepts in the vault's own prompt, and the join code is opaque to the extension.
