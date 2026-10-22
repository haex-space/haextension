# Implementation Plan: haex-doom — DOOM as a haextension

**Branch**: `020-haex-doom` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-haex-doom/spec.md`

## Summary

A new haextension `apps/haex-doom` runs Crispy DOOM 7.2, compiled to WebAssembly with the engine's upstream Emscripten support, inside the vault's extension frame. A Nuxt shell (structure of `apps/haex-tetris`) provides the start screen, touch overlay, game-file import, settings and multiplayer lobby, and talks to the engine through a small exported/imported function set ([contracts/engine-bridge.md](contracts/engine-bridge.md)). Freedoom 1/2 and the shareware episode ship gzip-compressed to fit the bundle limits. Saves sync through an extension table; settings and imported game files stay on the device. Multiplayer replaces the engine's UDP module with peer channels that the vault host carries over its iroh endpoint as QUIC datagrams between contacts. Three host changes (WebAssembly CSP, pointer lock/fullscreen, peer channels) and one SDK change (`client.peers`) are delivered as separate pull requests in their repositories. Decisions and evidence: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 + Vue 3.5 / Nuxt 4 (shell); C99 compiled with Emscripten (engine patches); Rust (host changes in haex-vault).

**Primary Dependencies**: Crispy DOOM `crispy-doom-7.2` (`fdeabe4c23a833534b70aa84a22f1685aae7125d`), Emscripten SDL2 + SDL2_mixer ports, `@haex-space/vault-sdk` ≥ 4.8.1 (≥ the S1 release for multiplayer), haex-ui layer, Drizzle ORM, Pinia, @nuxtjs/i18n. No new npm dependency planned.

**Storage**: Extension tables via the SDK database API (`saves` synced; `game_files_no_sync`, `game_file_chunks_no_sync` device-local); SDK `storage` for settings and engine config ([data-model.md](data-model.md)).

**Testing**: vitest (node environment, `app/**/*.test.ts`, as in `apps/haex-tetris/vitest.config.ts`) for pure TypeScript modules; `vue-tsc --noEmit`; manual end-to-end scenarios in [quickstart.md](quickstart.md). Host changes: `cargo test` with `*_tests.rs` next to the changed files, per that repository's convention.

**Target Platform**: The vault's extension frame (`sandbox` iframe, opaque origin, no SharedArrayBuffer) on WebKitGTK (Linux), WebView2 (Windows), WKWebView (macOS, iOS), Android System WebView.

**Project Type**: Vault extension (static Nuxt build, signed `.xt` bundle) with an embedded WebAssembly engine.

**Performance Goals**: 35 game tics/s without audio dropouts on a mid-range phone (SC-002); input-to-peer delivery within the connection's round-trip time (SC-010).

**Constraints**: Bundle ≤ 64 MiB, ≤ 25 MiB per file; CSP `connect-src` limited to the extension's own prefix (no run-time downloads); no pthreads; SDK responses ≤ 16 MiB by default; host shortcut chords `Alt+ArrowLeft/Right` reserved.

**Scale/Scope**: One extension, ~7 shell screens/components (start, game, touch overlay, import, settings, lobby, about), ~5 small C patches, 2–4 players per game.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Checked against `.spaex/constitution.md`.

| Rule | Status |
|---|---|
| Work in a repository-local worktree on a topic branch; never author in the primary checkout | ✅ `.worktrees/haex-doom` on `020-haex-doom`. Host and SDK changes get their own worktrees and topic branches in their repositories. |
| All work lands on `main` through pull requests; no squash merge; Conventional Commits; no agent attribution in any artifact | ✅ One pull request per slice (see Delivery), rebase or merge commits. |
| Keep each task isolated and each change reviewable; ~100 net lines is a review warning, ~1000 a strong prompt to split | ✅ Split into 11 pull requests below. Exceptions per the rule: generated engine output is not committed; upstream engine sources are fetched at a pinned SHA, not vendored. |
| Prefer existing artifacts, native platform features, installed dependencies; no new dependency when avoidable (ponytail) | ✅ `DecompressionStream`, `crypto.subtle`, `<input type="file">`, `navigator.vibrate`, Gamepad API through SDL, the engine's own menus for volume/sensitivity; no new npm package. Upgrade paths marked `ponytail:` (bridge batching R-13, host game mode R-6). |
| Consult graphify before authoring a new named artifact | ✅ Consulted for this repository (research R-16); no candidate to extend. Re-consulted per task in the repository being changed. |
| Tests in separate files; one runnable check for non-trivial logic | ✅ `wad.test.ts`, `lobbyProtocol.test.ts`, `touchMapping.test.ts`, `saveStore.test.ts`; host `*_tests.rs`. |
| Validate data at trust boundaries | ✅ Imported files (`wad.ts`), lobby messages (`lobbyProtocol.ts`), settings JSON from storage, host-side handshake and contact-card verification. |
| Files over ~500 lines must be split or justified | ✅ None planned; upstream engine files are not hand-maintained by us. |
| No local absolute paths, no secrets in git; cross-repo references as repository + full SHA + path | ✅ Upstream engine pinned by full SHA; host/SDK references in research carry repository + SHA. Signing key stays in CI secrets. |
| Phases: later-phase features may be specified ahead but not implemented before prerequisites are in use | ✅ Multiplayer (US3) is implemented only after H3 and S1 are merged and released; US6 only after H2. |
| ADR for decisions affecting a Core Principle | ✅ Not required: the GPL-2.0 licence of one new app and the host capability changes do not change a constitution principle. |

**Post-design re-check**: ✅ No violations. Licence note: the new app is GPL-2.0 because the engine is; other apps in the repository are unaffected (separate packages, no shared code with the engine).

## Project Structure

### Documentation (this feature)

```text
specs/020-haex-doom/
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── engine-bridge.md
│   ├── host-frame.md
│   ├── lobby-protocol.md
│   └── peers-api.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/haex-doom/
├── LICENSE                         # GPL-2.0 text
├── package.json                    # build = engine:build && nuxt build; test = vitest run
├── nuxt.config.ts                  # as haex-tetris (extends packages/haex-ui, vault-sdk/nuxt, hash router)
├── haextension.config.json
├── vitest.config.ts
├── drizzle.config.ts
├── haextension/
│   ├── manifest.json               # permissions: peers, contacts (multiplayer slice), migrationsDir
│   └── haex-doom-logo.png
├── engine/
│   ├── build.sh                    # pinned emsdk image, fetch upstream at SHA, apply patches, cmake build, stamp
│   ├── fetch-data.sh               # Freedoom 0.13.0 + doom1.wad with SHA-256 checks → public/wads/*.wad.gz
│   ├── patches/                    # small patches against crispy-doom-7.2 (events, hooks, haptics)
│   ├── src/net_bridge.c            # net_sdl_module over the shell's peer channels
│   ├── src/haex_exports.c          # haex_post_event, haex_set_paused, haex_net_peer_closed
│   ├── config/default.cfg, crispy-doom.cfg   # WASD defaults, OPL music, always-run
│   └── licenses/                   # Freedoom COPYING, id shareware licence
├── public/                         # engine/ and wads/ are build output (git-ignored)
└── app/
    ├── app.vue
    ├── pages/index.vue             # start screen ↔ game view
    ├── components/doom/            # GameView, TouchOverlay, GameList, ImportButton, SettingsSheet, Lobby, About
    ├── composables/                # useEngine, useHostLocale, usePeers
    ├── stores/                     # haexvault (DB setup as haex-draw), games, saves, settings, lobby
    ├── database/schemas/index.ts, database/migrations/
    ├── lib/                        # pure, unit-tested
    │   ├── wad.ts (+ .test.ts)               # validate, identify, fingerprint
    │   ├── bundledGames.ts
    │   ├── touchMapping.ts (+ .test.ts)      # stick/swipe → engine events
    │   ├── lobbyProtocol.ts (+ .test.ts)
    │   ├── saveStore.ts (+ .test.ts)         # MEMFS path ↔ save row mapping
    │   └── engine/imports.ts                 # EM_JS import implementations
    └── locales/de.json, en.json
```

Root changes: `package.json` gets `release:haex-doom`; `.gitignore` covers `apps/haex-doom/public/engine/` and `public/wads/`.

**Structure Decision**: One new app under `apps/` following `apps/haex-tetris` (shell, tests next to code) and `apps/haex-draw` (database setup). The engine lives inside the app (`engine/`) because nothing else uses it.

### Outside this repository

```text
haex-space/haex-vault
  H1 src-tauri/src/extensions/protocol/csp.rs (+ tests)                       WebAssembly
  H2 src/components/extensions/ExtensionFrame.vue                             pointer lock, fullscreen
  H3 src-tauri/src/extensions/peers/ (new), permissions/model.rs, target.rs,
     manifest_map.rs, bridge/allowlist.rs, sync/endpoint.rs (ALPN + datagrams),
     notification + i18n, specs/017-extension-host/contracts/bridge.md          peer channels, invitations
haex-space/vault-sdk
  S1 src/commands/peers.ts, src/api/peers.ts, client.ts, events.ts, types       client.peers
```

## Delivery (pull requests, in order)

| # | Repository | Slice | Depends on |
|---|---|---|---|
| 1 | haex-vault | H1 WebAssembly in extension frames | — |
| 2 | haextension | Engine build (`engine/`), app skeleton, start screen, bundled games, keyboard play, pause on blur, About/licences — **US1** | 1 (for running inside the vault) |
| 3 | haextension | Touch overlay, landscape prompt, haptics, input switching — **US2** | 2 |
| 4 | haextension | Saves (synced table) and settings/config (storage) — **US4** | 2 |
| 5 | haextension | Game-file import, validation, removal — **US5** | 4 (fingerprints, tables) |
| 6 | haex-vault | H2 pointer lock + fullscreen | — |
| 7 | haextension | Mouse look, fullscreen toggle with fallback — **US6** | 2, 6 |
| 8 | haextension | Gamepad defaults and verification — **US7** | 2 |
| 9 | haex-vault | H3 peer channels: permission kind, ALPN + handshake + datagrams, bridge methods, events, invitation notification | — |
| 10 | vault-sdk | S1 `client.peers` API, events, types; release | 9 |
| 11 | haextension | `net_bridge.c`, lobby, invitations, multiplayer start/leave — **US3** | 2, 9, 10 released |

Slices 2 and 9 are the largest; tasks will split them further into reviewable commits, and slice 9 may be split into "channel + handshake" and "bridge + invitations" pull requests if it exceeds the review-size warning substantially.

## Risks

| Risk | Mitigation |
|---|---|
| Audio stays muted on iOS WKWebView | Resume the AudioContext inside the start tap (R-14); verified first on iOS in slice 2. |
| `crypto.subtle` unavailable on the `holzi-ext://` scheme | Checked in slice 5; fallback hash from an existing dependency (R-9). |
| Bridge latency/overhead per datagram too high | Measure in slice 11 against SC-010; batching upgrade path (R-13). |
| Hole punching fails between two mobile networks | Relay fallback is automatic; SC-010 allows 150 ms round trip. |
| A contact's card lists an outdated relay or endpoint (the host resolves addresses only from cards, `MemoryLookup`) | Invitation reports `unreachable` with a hint to exchange cards again; slice 9 tests dialing with the card's `iroh_relay`. |
| The invitee's vault is locked (endpoint only runs while a vault is open) | Invitation reports `unreachable`; the lobby lets the host retry. |
| Engine gamepad support insufficient in the browser | Shell-side Gamepad API mapping via `haex_post_event` (R-15). |

## Complexity Tracking

No constitution violations to justify.
