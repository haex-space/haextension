---

description: "Task list for haex-doom"
---

# Tasks: haex-doom — DOOM as a haextension

**Input**: Design documents from `specs/020-haex-doom/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: The spec does not ask for TDD. The constitution requires one runnable check per piece of non-trivial logic, so each pure module gets one test file (vitest here, `*_tests.rs` in the host), written in the same task as the module.

**Organization**: Grouped by user story (priority order from spec.md). Delivery order across repositories is in [plan.md › Delivery](plan.md#delivery-pull-requests-in-order).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1 … US7)
- Paths without a prefix are relative to this repository (`haex-space/haextension`). `haex-vault:` and `vault-sdk:` prefix paths in those repositories (`haex-space/haex-vault`, `haex-space/vault-sdk`).

## Rules for every task

- Work in a repository-local worktree on a topic branch of the repository being changed (`git worktree list` first); never in a primary checkout.
- Before authoring a new named artifact, run `graphify query "<intent>" --budget 1200` in that repository and note the candidates considered in the commit or PR description.
- Conventional Commits, no agent attribution anywhere; one pull request per delivery slice, merged without squash.
- Before handoff: `pnpm --filter haex-doom test`, `pnpm --filter haex-doom exec vue-tsc --noEmit`, lint; in haex-vault its `cargo test`/lint commands; in vault-sdk its test/build commands. Report what ran.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The new app exists, builds an empty shell and is releasable.

- [X] T001 Create `apps/haex-doom/` from the `apps/haex-tetris/` skeleton: `package.json` (name `haex-doom`, version `0.1.0`, `"license": "GPL-2.0-only"`, scripts `dev`, `postinstall`, `ext:dev`, `package`, `build:release` as in haex-tetris, `test: "vitest run"`, `engine:build: "bash engine/build.sh"`, `build: "pnpm engine:build && nuxt build --preset static"`; same dependencies as haex-tetris minus unused ones), `nuxt.config.ts` (as haex-tetris, `devServer.port: 4011`), `haextension.config.json` (`dev.port: 4011`), `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `app/app.vue`, `app/assets/css/tailwind.css`, `app/pages/index.vue` (placeholder)
- [X] T002 Create `apps/haex-doom/haextension/manifest.json` with the repository's shared `publicKey` (same as `apps/haex-tetris/haextension/manifest.json`), empty `permissions` (`database`, `filesystem`, `shell`, `http` as empty arrays), `icon: "haextension/haex-doom-logo.png"`, `singleInstance: true`, `displayMode: "auto"`, `i18n` de/en name "DOOM" and descriptions; add a 512×512 `apps/haex-doom/haextension/haex-doom-logo.png` (original artwork, no id Software logo)
- [X] T003 [P] Add the GPL-2.0 licence text as `apps/haex-doom/LICENSE`
- [X] T004 [P] Add `apps/haex-doom/public/engine/`, `apps/haex-doom/public/wads/`, `apps/haex-doom/public/licenses/` and `apps/haex-doom/engine/.build/` to `.gitignore`
- [X] T005 [P] Add `"release:haex-doom": "node scripts/release.js haex-doom"` to the root `package.json`
- [X] T006 [P] Copy `apps/haex-tetris/app/composables/useHostLocale.ts` to `apps/haex-doom/app/composables/useHostLocale.ts` (i18n config in `nuxt.config.ts` as haex-tetris; translations live in per-component `<i18n lang="yaml">` blocks, the repository's convention, so no locale files)
- [X] T007 Run `pnpm install` at the repository root and commit the updated `pnpm-lock.yaml`; confirm `node scripts/extensions.js` lists `haex-doom`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The engine builds reproducibly, game data is bundled, the shell can load and run the engine, and the vault allows WebAssembly.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T008 haex-vault (H1, own worktree/branch `feat/extension-frame-wasm`): in `haex-vault:src-tauri/src/extensions/protocol/csp.rs` `policy()`, change `script-src {p} {hashes}` to `script-src {p} 'wasm-unsafe-eval' {hashes}`; extend the module's existing tests (or add `csp_tests.rs` following the repository's `*_tests.rs` convention) asserting `'wasm-unsafe-eval'` is present and `'unsafe-eval'` is absent; update the CSP description in `haex-vault:specs/017-extension-host/contracts/` if it lists the policy; open the pull request ([contracts/host-frame.md](contracts/host-frame.md) H1)
  **Note**: committed on `feat/extension-frame-wasm` (haex-vault `0491b357`), research R12 of spec 017 updated there; pull request haex-space/haex-vault#530
- [X] T009 Write `apps/haex-doom/engine/build.sh`: pin the `emscripten/emsdk` image by tag and digest (latest stable at implementation time, ≥ 4.0); compute a stamp = SHA-256 over the upstream SHA `fdeabe4c23a833534b70aa84a22f1685aae7125d`, `engine/patches/*`, `engine/src/*`, `engine/config/*` and the image digest, and exit early when `public/engine/.stamp` matches; clone `https://github.com/fabiangreffrath/crispy-doom.git` into `engine/.build/crispy-doom` and check out the SHA; `git apply` every `engine/patches/*.patch` in name order; copy `engine/src/*.{c,h}` into its `src/`; run `emcmake cmake -DCMAKE_BUILD_TYPE=Release -DENABLE_SDL2_NET=OFF -DENABLE_SDL2_MIXER=ON` and `cmake --build` for the `crispy-doom` target only inside the container (mount the app directory, run as the host user); link flags in addition to upstream's Emscripten flags: `-sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCrispyDoom -sINVOKE_RUN=0 -sENVIRONMENT=web -sEXPORTED_RUNTIME_METHODS=FS,callMain,cwrap -sEXPORTED_FUNCTIONS=_main,_haex_post_event,_haex_set_paused,_haex_net_peer_closed` and `.js` output (not `.html`); if upstream's CMake forces `.html`, change that in a patch; copy `crispy-doom.js`/`.wasm` to `public/engine/`; run `engine/fetch-data.sh`; write the stamp
- [X] T010 [P] Write `apps/haex-doom/engine/fetch-data.sh`: download `https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip`, verify SHA-256 `3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59`, extract `freedoom1.wad`, `freedoom2.wad`, `COPYING.txt`; download the shareware `doom1.wad` v1.9 from a stable mirror, verify SHA-1 `5b2e249b9c5133ec987b3ea77596381dc0d6bc1d` and record the mirror URL plus the file's SHA-256 in the script; cache downloads in `engine/.build/data/`; write `gzip -9 -n` copies to `public/wads/{freedoom1,freedoom2,doom1}.wad.gz`; copy `COPYING.txt` and `engine/licenses/doom-shareware.txt` (the id shareware licence text) to `public/licenses/`; print the SHA-256 of each uncompressed WAD
- [X] T011 [P] Write `apps/haex-doom/engine/src/haex_exports.c` per [contracts/engine-bridge.md](contracts/engine-bridge.md): `EMSCRIPTEN_KEEPALIVE void haex_post_event(int type, int data1, int data2, int data3, int data4)` builds an `event_t` and calls `D_PostEvent`; `EMSCRIPTEN_KEEPALIVE void haex_set_paused(int paused)` sets the engine's `sendpause` only when `!netgame` and the engine's `paused` state differs from the request; `haex_net_peer_closed` as an empty stub until T047
- [X] T012 [P] Write `apps/haex-doom/engine/src/haex_imports.h` and `haex_imports.c` with the `EM_JS` functions of the contract (`haex_file_written`, `haex_haptic`, `haex_net_send`, `haex_net_recv`, `haex_net_resolve`), each delegating to `Module.haexImports.<name>` and doing nothing when it is absent
- [X] T013 Write `apps/haex-doom/engine/patches/0001-build-haex-sources.patch` adding `haex_exports.c` and `haex_imports.c` to the Doom target's sources in upstream `src/CMakeLists.txt` (and the `.js` output change from T009 if needed)
  **Note**: added during implementation — `0002-yield-each-frame.patch` (`I_FinishUpdate` awaits `requestAnimationFrame`, 100 ms fallback while hidden; uncapped rendering never yields in the browser otherwise) and `0003-opl-delay-emscripten.patch` (upstream tests `EMSCRIPTEN`, compilers only define `__EMSCRIPTEN__`, so OPL detection spun forever; also bounded so a silent device cannot hang); link flag `-sEMULATE_FUNCTION_POINTER_CASTS=1` (state actions are called through a three-argument pointer); the canvas needs `id="canvas"` (SDL2's selector); `crispy_widescreen` is set by the shell from the game area (`app/lib/engineConfig.ts`); `grabmouse 0` until US6
- [X] T014 [P] Write `apps/haex-doom/engine/config/default.cfg` and `crispy-doom.cfg` (research R-6): WASD (`key_up` W, `key_down` S, `key_strafeleft` A, `key_straferight` D), arrows turn, `key_fire` Ctrl, `key_use` E, `key_prevweapon`/`key_nextweapon` on `[`/`]`, Tab automap, no Alt strafe (`key_strafe` unbound), `autorun 1`, `snd_musicdevice 3` (OPL), `mouseb_fire 0`, `novert 1`; Crispy: widescreen on, uncapped frame rate on, vsync on. Use the key names from upstream `src/m_config.c`
- [X] T015 [P] Create `apps/haex-doom/app/lib/bundledGames.ts`: readonly list of `{ id, title, fileName, family, asset, fingerprint }` for "Freedoom: Phase 1" (`freedoom1.wad`, `doom1` family), "Freedoom: Phase 2" (`freedoom2.wad`, `doom2`), "DOOM (shareware)" (`doom1.wad`, `doom1`), `asset` = `wads/<file>.gz`, `fingerprint` = SHA-256 of the uncompressed file printed by T010
- [X] T016 [P] Create `apps/haex-doom/app/lib/wadLoader.ts`: `loadBundledWad(url): Promise<Uint8Array>` using `fetch` + `DecompressionStream('gzip')`; throws an `Error` with `cause` on HTTP or decompression failure
- [X] T017 Create `apps/haex-doom/app/lib/engine/imports.ts`: builds the `haexImports` object for `Module` with replaceable handlers (`fileWritten(path)`, `haptic(kind)`, `netSend(peer, bytes)`, `netRecv(buf, cap)`, `netResolve(name)`), defaults are no-ops / `0` / `-1`
- [X] T018 Create `apps/haex-doom/app/composables/useEngine.ts`: `start({ wad, fileName, configs, saves, args })` dynamically imports `engine/crispy-doom.js` relative to the app base, creates the module with `canvas`, `noInitialRun: true`, `locateFile`, `haexImports`; creates `/wads`, `/config`, `/saves/<fingerprint>/` in `FS`; writes WAD, configs and saves; calls `callMain` with the argument list from the contract; exposes `postEvent`, `setPaused` via `cwrap`, a `state` ref (`idle | loading | running | failed`) and `error`; maps a `WebAssembly.CompileError`/CSP refusal to `failed` with reason `host-outdated`
- [X] T019 Verify the foundation: `pnpm --filter haex-doom engine:build` succeeds twice (second run hits the stamp), `public/wads/*.gz` sizes are as in research R-3, and a temporary debug page starts Freedoom Phase 1 in a plain browser (`pnpm --filter haex-doom dev`); remove the debug page afterwards

**Checkpoint**: Engine builds and runs; user stories can start.

---

## Phase 3: User Story 1 — Play DOOM on the desktop with the keyboard (Priority: P1) 🎯 MVP

**Goal**: Start screen with bundled games; keyboard play with sound and music; pause on blur.

**Independent Test**: In a vault with H1, start the shareware episode and finish E1M1 by keyboard with sound and music (quickstart US1).

- [X] T020 [US1] Create `apps/haex-doom/app/components/doom/GameList.vue`: lists `bundledGames` (later also imported games) with title and a start action; disabled while the engine loads
- [X] T021 [US1] Create `apps/haex-doom/app/lib/audioUnlock.ts`: `unlockAudio()` called synchronously inside the start tap: sets `navigator.audioSession.type = 'playback'` when available, creates/resumes a shared `AudioContext`; plus `resumeEngineAudio(module)` that resumes `module.SDL2?.audioContext` on the next pointer/key event if it is suspended (research R-14)
- [X] T022 [US1] Create `apps/haex-doom/app/components/doom/GameView.vue`: hosts the `<canvas>` (focusable, `tabindex="0"`, focused on start), fills the available area without distortion (FR-007; canvas CSS size from container with the engine's aspect, letterboxing only where widescreen does not cover), calls `preventDefault` on keydown for Tab, Space, arrows and F-keys inside the game so the frame does not scroll or move focus
- [X] T023 [US1] Wire `apps/haex-doom/app/pages/index.vue`: start screen (`GameList`) ↔ game (`GameView`); start = `unlockAudio()` → `loadBundledWad` → `useEngine().start(...)` with bundled default configs (fetched from `engine/config` copied to `public/engine/config/` by `build.sh`); back to the start screen when the engine quits
- [X] T024 [US1] Pause handling in `apps/haex-doom/app/components/doom/GameView.vue` (FR-006): on `blur` → `setPaused(true)`, on `focus` → `setPaused(false)`; on `visibilitychange` hidden → `setPaused(true)` and show a "Continue" overlay that resumes on tap; skip all of this when a netgame is running
- [X] T025 [US1] Host-outdated state in `apps/haex-doom/app/pages/index.vue`: when `useEngine().error` is `host-outdated`, the start screen shows a localized "Please update your vault to play DOOM" message instead of the game list (SC-007)
- [X] T026 [P] [US1] Create `apps/haex-doom/app/components/doom/AboutDialog.vue` (FR-037): GPL-2.0 notice, Crispy DOOM credits with upstream URL and SHA, link to this repository's `apps/haex-doom` source, Freedoom `COPYING.txt` and the shareware licence loaded from `public/licenses/`; entry from the start screen
- [X] T027 [P] [US1] Add all US1 strings as de/en `<i18n lang="yaml">` blocks in the US1 components under `apps/haex-doom/app/`
- [ ] T028 [US1] Validate `specs/020-haex-doom/quickstart.md` rows "US1 desktop keyboard" and "US1 limits" on Linux and one more desktop OS; note results in the PR (slice 2)

**Checkpoint**: MVP — DOOM is playable on desktop.

---

## Phase 4: User Story 2 — Touch controls on phones and tablets (Priority: P2)

**Goal**: Two-thumb touch overlay, landscape prompt, haptics, automatic input switching.

**Independent Test**: Finish the first map of the shareware episode on a touch-only phone (quickstart US2).

- [X] T029 [P] [US2] Create `apps/haex-doom/app/lib/touchMapping.ts` with `stickToAxes(dx, dy, radius)` → `{ strafe, forward }` in −32768…32767 with a 15 % dead zone and clamping, `swipeToTurn(deltaPx, sensitivity, carry)` → `{ turn: integer, carry }` keeping sub-unit remainders, and `TOUCH_BUTTON_KEYS` (fire, use, prevWeapon, nextWeapon, automap, menu → `doomkeys.h` codes matching `engine/config/*.cfg`); tests in `apps/haex-doom/app/lib/touchMapping.test.ts` (dead zone, clamping, carry, key table matches config)
- [X] T030 [US2] Create `apps/haex-doom/app/components/doom/TouchOverlay.vue`: pointer events with `setPointerCapture` per `pointerId`, `touch-action: none`; left half = floating stick → `postEvent(3, 0, 0, forward, strafe)` each frame while held and a zero event on release; right half = turn area → `postEvent(2, 0, turn, 0, 0)`; buttons in the bottom/right corners and top-right (menu, automap) so the centre stays free (FR-011, FR-012); button down/up → `postEvent(0|1, key)`
- [X] T031 [US2] Create `apps/haex-doom/app/composables/useInputMode.ts`: `'touch' | 'pointer' | 'keyboard' | 'gamepad'` from the last input (`pointerdown.pointerType`, `keydown`, non-touch `mousemove`, gamepad button); `GameView` shows `TouchOverlay` only in `touch` mode and initially when `matchMedia('(pointer: coarse)')` matches (FR-016)
- [X] T032 [US2] Landscape prompt in `apps/haex-doom/app/components/doom/GameView.vue` (FR-013): on touch devices while `matchMedia('(orientation: portrait)')` matches, show a rotate overlay and pause a single-player game
- [X] T033 [US2] Write `apps/haex-doom/engine/patches/0004-haptic-hooks.patch`: call `haex_haptic(0)` in `P_FireWeapon` (`src/doom/p_pspr.c`) and `haex_haptic(1)` in `P_DamageMobj` (`src/doom/p_inter.c`) when the affected player is `&players[consoleplayer]`; include `haex_imports.h`
- [X] T034 [US2] Create `apps/haex-doom/app/stores/settings.ts` (Pinia) with `{ haptics: true, touchTurnSensitivity: 1, lastGame: null }` in memory (persisted in US4) and set `haexImports.haptic` to `navigator.vibrate(kind === 0 ? 15 : 40)` when `haptics` is on and `vibrate` exists (FR-014)
- [X] T035 [US2] Create `apps/haex-doom/app/components/doom/SettingsSheet.vue`: haptics switch and touch turn sensitivity slider (0.25–4); reachable from the start screen and the in-game menu button; de/en strings in the component's `<i18n>` block
  **Note (T029–T035)**: implemented as a virtual gamepad — the overlay sends `ev_joystick` state (buttons via `joyb_*` 0–5, analog move/strafe in ±65536, menu directions in `data6`) and turns with `ev_mouse`; the engine's menus follow joystick buttons and directions, so no extra Enter/Y button is needed. Haptics patch is `0004-haptic-hooks.patch`. Settings are reachable from the start screen (`SettingsDialog.vue`); the in-game menu button opens the engine's own menu. `mouse_acceleration 1.0` keeps swipe turning linear.
- [ ] T036 [US2] Validate `specs/020-haex-doom/quickstart.md` row "US2 touch" on one Android and one iOS device, including audio after the start tap; note results in the PR (slice 3)

**Checkpoint**: Playable on phones.

---

## Phase 5: User Story 3 — Play together with other vault users (Priority: P3)

**Goal**: 2–4 players, coop or deathmatch, invited from contacts, over peer channels.

**Independent Test**: Desktop + phone on different networks play a coop map via a contact invitation; then four players deathmatch for 10 minutes (quickstart US3).

**Prerequisite outside this repository** (start early; the extension tasks wait for the SDK release):

- [ ] T037 [US3] haex-vault: implement PR 1 of the host spec (`haex-space/haex-vault` @ `8973b7afd02542aa7077d6a43e5d238f5b7cf2e5` : `specs/057-extension-peer-channels/` `tasks.md`): permission kind `peers`, ALPN, verification of foreign devices against the signed device list, fast/reliable channel, cleanup
- [ ] T038 [US3] haex-vault: implement PR 2 of the host spec: lobbies, join codes, admission of non-contacts for public lobbies (ADR 0016), rate limiting
- [ ] T039 [US3] haex-vault: implement PR 3 of the host spec: invitations to all of a contact's devices, the vault's own invitation prompt and notification
- [ ] T040 [US3] haex-vault: implement PR 4 of the host spec: bridge methods `extension_peers_*`, `peers:*` events, error mapping, documentation in spec 017's `bridge.md`
- [ ] T041 [US3] haex-vault: validate the host spec's `quickstart.md` with two vaults and release a vault version containing PR 1–4
- [ ] T042 [US3] Align `specs/020-haex-doom/contracts/peers-api.md` with the host's final `contracts/sdk.md` if the implementation changed it, and update the referenced commit
- [ ] T043 [US3] vault-sdk (S1, own worktree/branch `feat/peers-api`): `vault-sdk:src/commands/peers.ts` (`PEERS_COMMANDS`), register in `vault-sdk:src/commands/index.ts` (export, `TAURI_COMMANDS`, `TauriCommand` union), `vault-sdk:src/api/peers.ts` (`PeersAPI` exactly as the host spec's `contracts/sdk.md`: `openLobbyAsync`, `closeLobbyAsync`, `joinAsync`, `removeAsync`, `inviteAsync`, `cancelInviteAsync`, `sendAsync(channelId, Uint8Array, { reliable })` encoding base64, `closeAsync`, and the mapping of the host's numeric codes plus `reason` to `PEER_*` codes), `public readonly peers` in `vault-sdk:src/client.ts`, event names in `vault-sdk:src/events.ts` and forwarding in `vault-sdk:src/client/init.ts`, types in `vault-sdk:src/types/peers.ts`, manifest permission type `peers`; one test for `sendAsync` encoding; release a minor version

**Extension side** (after T043 is released):

- [ ] T044 [US3] Raise `@haex-space/vault-sdk` to the S1 release in `apps/haex-doom/package.json` and the root `package.json` `pnpm.overrides`; `pnpm install`
- [ ] T045 [US3] Add `"peers": [{ "target": "*", "action": "connect" }]` and `"contacts": [{ "target": "*", "action": "read" }]` to `apps/haex-doom/haextension/manifest.json`
- [ ] T046 [P] [US3] Create `apps/haex-doom/app/lib/lobbyProtocol.ts` per [contracts/lobby-protocol.md](contracts/lobby-protocol.md): `encodeMessage`, `decodeMessage` (validate shape; unknown `t` or `v ≠ 1` → `null`), `parseInvitePayload`, `checkCompatibility(payload, localGames, version)` → `ok | game-missing | version`; tests in `apps/haex-doom/app/lib/lobbyProtocol.test.ts`
- [ ] T047 [US3] Write `apps/haex-doom/engine/src/net_bridge.c` providing `net_sdl_module` per [contracts/engine-bridge.md](contracts/engine-bridge.md) "Network module rules" (one `net_addr_t` per peer number kept in a table, `SendPacket` → `haex_net_send`, non-blocking `RecvPacket` → `haex_net_recv` with 4-byte LE peer prefix, `ResolveAddress` → `haex_net_resolve`, packets > 1,024 bytes dropped); `engine/patches/0005-net-bridge.patch` builds it and removes the stub `net_sdl_module` in upstream `src/net_sdl.c` when SDL2_net is disabled; implement `haex_net_peer_closed` in `engine/src/haex_exports.c` by marking the peer's address so the server/client treats it as disconnected
- [ ] T048 [US3] Create `apps/haex-doom/app/composables/usePeers.ts`: feature detection (`client.peers` present and a probe call does not fail with "unknown method"; otherwise multiplayer is hidden, SC-007); maps `channelId ↔ peer number`; wires `haexImports.netSend/netRecv/netResolve` (queue of incoming datagrams, `"host"` → host channel's peer); forwards reliable messages to the lobby store; on `peers:channel-closed` calls `haex_net_peer_closed`
- [ ] T049 [US3] Create `apps/haex-doom/app/stores/lobby.ts` implementing the lobby and player state machines of [data-model.md](data-model.md) (host: create with `openLobbyAsync(lobbyId, visibility)` storing the join code, invite up to 3 contacts, handle `peers:joined` (verified flag), `hello`/`reject`, remove a player via `reject removed` + `removeAsync`, `closeLobbyAsync` on start or cancel, `start`; guest: accept an invitation or `joinAsync(code, displayName, { v: 1, extensionVersion })`, check the game from the first `lobby` message, `hello`, wait for `start`; `leave`); deathmatch options `monsters` (default `false`) and `timeLimit` `0 | 10 | 20` (default `10`); host start → engine args `-privateserver -nodes N -skill S -warp MAP` plus for deathmatch `-altdeath`, `-nomonsters` when monsters are off, `-timer T` when `T > 0`; guest → `-connect host`
- [ ] T050 [US3] Create `apps/haex-doom/app/components/doom/MultiplayerLobby.vue`: choose game (bundled + imported), mode, map (episode/map list by family), skill, for deathmatch monsters on/off (default off) and time limit off/10/20 min (default 10), visibility contacts only (default) / public with the note that directly connected players see the host's network address; show the join code with a copy action; per-player "not verified" badge and a remove action; contact picker from `client.contacts.listAsync` filtered to contacts whose `readAsync` result has `holziAddresses.devices.length > 0`; player list with states; start button enabled when ≥ 1 guest joined; de/en strings in the component's `<i18n>` block
- [ ] T051 [US3] Create `apps/haex-doom/app/components/doom/JoinByCode.vue`: input for a join code and the player's display name (prefilled from the vault identity where available), calls the lobby store's join; shows "This game is no longer open" for `PEER_LOBBY_CLOSED` and "Only the host's contacts may join" for `PEER_NOT_ALLOWED`; de/en strings in the component's `<i18n>` block
- [ ] T052 [US3] Handle `peers:channel-opened` with `origin: "invitation"` in `apps/haex-doom/app/stores/lobby.ts`: the vault already asked the user (no own invitation dialog); run `checkCompatibility` on the payload, then send `hello`, or show the reason (FR-030) and send `leave`
- [ ] T053 [US3] Write `apps/haex-doom/engine/patches/0006-exit-hooks.patch`: `I_Error` and `I_Quit` call a new `EM_JS` `haex_engine_exit(int is_error, const char *message)` before exiting; shell side in `useEngine.ts` tears the module down and shows the message (consistency failure, host left) as a notice on the start screen (FR-032, FR-034); netgames ignore pause requests (FR-006) and rely on the engine's 30 s timeout for background players (FR-033)
- [ ] T054 [US3] Measure bridge round trip and tic rate with 4 players (2 desktop, 2 phones; one pair on a relayed connection) against SC-009/SC-010; if the per-datagram path is too slow, batch per animation frame in `usePeers.ts`; otherwise leave a `ponytail:` comment naming the batching upgrade path (research R-13)
- [ ] T055 [US3] Validate `specs/020-haex-doom/quickstart.md` rows "US3 multiplayer", "US3 join code", "US3 deathmatch options" and "US3 mismatch"; note results in the PR (slice 11)

**Checkpoint**: Multiplayer works across desktop and mobile.

---

## Phase 6: User Story 4 — Keep save games and settings (Priority: P4)

**Goal**: Saves sync through the vault; settings and engine config persist per device.

**Independent Test**: Save, restart the vault, load; save on device 1 and load on device 2 (quickstart US4).

- [X] T056 [US4] Database setup as in `apps/haex-draw`: `apps/haex-doom/drizzle.config.ts` (`out: ./app/database/migrations`), `apps/haex-doom/app/database/schemas/index.ts` with table `saves` named via `getTableName(manifest.publicKey, "haex-doom", "saves")`: `id` text primary key "`<game_fingerprint>:<slot>`, deterministic, so the same slot saved on two devices is the same row and the sync keeps the later write (FR-046)", `game_fingerprint` text not null, `slot` integer not null "0–7 (the engine's eight slots). Unique together with `game_fingerprint`", `name` text not null, `data` blob not null, `saved_at` text not null (ISO 8601), unique index (`game_fingerprint`, `slot`); generate the migration into `apps/haex-doom/app/database/migrations/`; add `"migrationsDir": "database/migrations"` to the manifest; `apps/haex-doom/app/stores/haexvault.ts` registering migrations, `initializeDatabase(schema)` and `setupComplete()` like `apps/haex-draw/app/stores/haexvault.ts`
- [X] T057 [P] [US4] Create `apps/haex-doom/app/lib/saveStore.ts`: `parseSavePath(path)` → `{ fingerprint, slot }` only for `/saves/<64 hex>/doomsav<0-7>.dsg`, else `null`; `saveDescription(bytes)` reads the 24-byte description at the start of the save (`SAVESTRINGSIZE`), trimmed at the first NUL; `savePath(fingerprint, slot)`; tests in `apps/haex-doom/app/lib/saveStore.test.ts`
- [X] T058 [US4] Create `apps/haex-doom/app/stores/saves.ts`: `listForGame(fingerprint)`, `upsert(fingerprint, slot, name, bytes)` as one `INSERT … ON CONFLICT (id) DO UPDATE` of all columns (`saved_at` = now) with the blob as `{ "$bytes": base64 }`; verify in the host's sync code how concurrent writes to one row are ordered and that a row cannot end up mixing columns from two writes (research R-17), adjusting the write if needed; `loadIntoFs(module, fingerprint)` writing each save to `savePath` before `callMain`; a failed write shows a toast and leaves the previous row unchanged (FR-020)
- [X] T059 [US4] Write `apps/haex-doom/engine/patches/0007-file-written-hooks.patch`: call `haex_file_written(savegame path)` in `G_DoSaveGame` (`src/doom/g_game.c`) after the temporary file was renamed into place, and `haex_file_written(path)` for each config file at the end of `M_SaveDefaults` (and the extra-config writer) in `src/m_config.c`
- [X] T060 [US4] Persist settings: `apps/haex-doom/app/stores/settings.ts` loads/saves key `settings` through the SDK `storage` API as JSON, validating each field (`haptics` boolean; `touchTurnSensitivity` number 0.25–4, default 1; `lastGame` 64-hex fingerprint or null) and falling back to defaults on invalid input; engine configs: keys `engine:default.cfg` and `engine:crispy-doom.cfg` written to `/config/` before start (bundled defaults when absent) and saved from `haexImports.fileWritten`
- [X] T061 [US4] Route `haexImports.fileWritten` in `apps/haex-doom/app/composables/useEngine.ts`: save paths → `saves.upsert` (name via `saveDescription`), config paths → settings store; ignore other paths
  **Note (T056–T061)**: Drizzle defines the schema and migration; saves are read and written with plain SQL through `client.database`, because the host returns rows as arrays of column values and takes BLOBs as `{"$bytes": base64}` (base64 helpers from the SDK). The host's sync is column-level LWW on HLCs and only re-stamps changed columns, so the single-statement upsert keeps `data` and `saved_at` of one save together (research R-17 verified); `name` may lag behind when it did not change, so anything that shows it later reads it from `data` with `saveDescription`. The engine only saves its config at exit, so patch `0007-file-written-hooks.patch` also saves it when the menu closes (config hotkeys outside the menu, such as screen size, are stored the next time it does); the same patch reports saves deleted in the save menu (`haex_file_removed`). `lastGame` from the data model is not stored (nothing uses it yet). Saves go into the engine's file system in `useEngine.prepareFileSystem` instead of `saves.loadIntoFs`, `fileWritten` is routed in `pages/index.vue`, and no `initializeDatabase(schema)` is needed for plain SQL. Crispy's save menu has eight pages, so slots run 0–77.
- [ ] T062 [US4] Validate `specs/020-haex-doom/quickstart.md` rows "US4 saves" and "US4 settings", including sync to a second device; note results in the PR (slice 4)

**Checkpoint**: Progress and settings survive restarts.

---

## Phase 7: User Story 5 — Import one's own game files (Priority: P5)

**Goal**: Validate, identify, store, list and remove imported base games on the device.

**Independent Test**: Import `DOOM2.WAD`, restart, play it; PNG and PWAD rejected (quickstart US5).

- [ ] T063 [P] [US5] Create `apps/haex-doom/app/lib/wad.ts` per [data-model.md](data-model.md) "Validation": `validateWad(bytes)` → `{ ok: true, family, title, fileName } | { ok: false, reason: 'too-small' | 'not-wad' | 'pwad' | 'truncated' | 'unknown-game' }` ("At least 12 bytes; magic is `IWAD`", "`numlumps` > 0; directory offset + 16 × `numlumps` ≤ file size; every lump's offset + size ≤ file size", identification by known SHA-1 first, then `MAP01` → `doom2`, `E4M1` → "The Ultimate DOOM", `E2M1` → "DOOM", `E1M1` → "DOOM (shareware)"); a known-SHA-1 table for the commercial IWADs (DOOM 1.9, The Ultimate DOOM 1.9, DOOM II 1.9, TNT, Plutonia) with values taken from the DoomWiki IWAD checksum tables, cited in a comment; `fingerprint(bytes)` = SHA-256 hex via `crypto.subtle`; tests in `apps/haex-doom/app/lib/wad.test.ts` using small synthetic WAD buffers built in the test (no real game data)
- [ ] T064 [US5] Check `crypto.subtle` availability inside the frame on Linux (`holzi-ext://`), macOS/iOS, Windows and Android; if unavailable anywhere, fall back to a SHA-256 implementation already present in `pnpm-lock.yaml` (e.g. a transitive `@noble/hashes`) by adding it as a direct dependency, and record the outcome in research R-9
- [ ] T065 [US5] Add tables to `apps/haex-doom/app/database/schemas/index.ts` and generate a migration: `game_files_no_sync` (`fingerprint` text primary key "SHA-256 of the file, lowercase hex", `title` text, `family` text "`doom1` or `doom2`", `file_name` text, `size` integer, `imported_at` text ISO 8601) and `game_file_chunks_no_sync` (`fingerprint` text, `index` integer, `data` blob "1 MiB except the last chunk", primary key (`fingerprint`, `index`))
- [ ] T066 [US5] Create `apps/haex-doom/app/stores/games.ts`: `all` = bundled + imported; `importFile(file)` → `arrayBuffer` → `validateWad` → fingerprint → "already available" when it matches a bundled or stored fingerprint → one transaction inserting metadata and 1 MiB chunks (`$bytes`); `remove(fingerprint)` deletes chunks and metadata, leaving saves (FR-025); `loadImported(fingerprint)` reassembles the chunks in index order and checks the size
- [ ] T067 [US5] Create `apps/haex-doom/app/components/doom/ImportButton.vue`: hidden `<input type="file" accept=".wad,.WAD">`, progress state, a localized message per rejection reason and for "already available" (FR-022, FR-024); `GameList.vue` lists imported games with a remove action behind a confirmation; de/en strings in the component's `<i18n>` block
- [ ] T068 [US5] Start imported games in `apps/haex-doom/app/pages/index.vue` via `games.loadImported` with their `file_name`
- [ ] T069 [US5] Validate `specs/020-haex-doom/quickstart.md` row "US5 import" with DOOM II and one Final DOOM file (> 16 MB) on desktop and Android; note results in the PR (slice 5)

**Checkpoint**: Owners can play their commercial games.

---

## Phase 8: User Story 6 — Mouse look and fullscreen on the desktop (Priority: P6)

**Goal**: Pointer-locked mouse turning and a fullscreen toggle with fallbacks.

**Independent Test**: With H2, mouse turns and fires, Esc releases; fullscreen toggles (quickstart US6).

- [ ] T070 [US6] haex-vault (H2, own worktree/branch `feat/extension-frame-pointer-lock`): in `haex-vault:src/components/extensions/ExtensionFrame.vue` set `sandbox="allow-scripts allow-pointer-lock"` and add `allow="fullscreen"`; document in `haex-vault:specs/017-extension-host/contracts/`; check on Linux that WebKitGTK grants pointer lock without a permission-request handler, else add the handler for that request type only; open the pull request ([contracts/host-frame.md](contracts/host-frame.md) H2)
- [ ] T071 [US6] Mouse look in `apps/haex-doom/app/components/doom/GameView.vue`: rely on the engine's own mouse grab (SDL relative mode → pointer lock) on click when the input mode is not `touch`; on `pointerlockerror` or missing API, set a flag that hides mouse options and shows no error (FR-009); confirm Esc both releases the lock and opens the menu
- [ ] T072 [US6] Create `apps/haex-doom/app/components/doom/FullscreenButton.vue`: `requestFullscreen()` on the game container when `document.fullscreenEnabled`; on rejection or absence, toggle an in-tab "fill" mode that hides the shell chrome; hidden when neither applies (FR-010)
- [ ] T073 [US6] Validate `specs/020-haex-doom/quickstart.md` row "US6 mouse/fullscreen" with and without H2; note results in the PR (slice 7)

---

## Phase 9: User Story 7 — Play with a gamepad (Priority: P7)

**Goal**: Gamepads work without configuration on desktop and mobile.

**Independent Test**: Play a map with only a gamepad (quickstart US7).

- [ ] T074 [US7] Enable the engine's game-controller support in `apps/haex-doom/engine/config/default.cfg`/`crispy-doom.cfg` (key names from upstream `src/m_config.c` and `src/i_joystick.c`): left stick move/strafe, right stick turn, right trigger fire, face buttons use/next weapon/menu; verify in the vault on desktop and Android that SDL sees the pad through the Gamepad API
- [ ] T075 [US7] If T074 shows the engine does not receive the pad in a WebView: create `apps/haex-doom/app/composables/useGamepad.ts` polling `navigator.getGamepads()` per animation frame and posting `ev_joystick`/key events with the same mapping; otherwise skip this task and note why in the PR
- [ ] T076 [US7] Pause a single-player game on `gamepaddisconnected` in `apps/haex-doom/app/composables/useInputMode.ts` and switch the input mode back to the previous mode (US7 scenario 2)
- [ ] T077 [US7] Validate `specs/020-haex-doom/quickstart.md` row "US7 gamepad"; note results in the PR (slice 8)

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T078 Confirm `.github/workflows/extension-build.yml` and `extension-release.yml` build `haex-doom` (Docker available on the runner, `build` runs `engine:build`), and that `haex sign` accepts the bundle (≤ 25 MiB per file, ≤ 64 MiB total); fix only what fails
- [ ] T079 [P] Run the SC-002 speed check (`-timedemo demo1` via a debug-only start option in `apps/haex-doom/app/pages/index.vue`) on a mid-range Android phone and an iPhone; record results in the US2 or polish PR
- [ ] T080 Run the full [quickstart.md](quickstart.md) once more on the released build; formatter, `vue-tsc --noEmit`, lint and tests green

---

## Dependencies & Execution Order

### Phase dependencies

- Setup (T001–T007) → Foundational (T008–T019) → user stories.
- T008 (H1) blocks running inside the vault, not the engine build; T009–T019 can proceed in parallel with it.

### User story dependencies

- **US1**: Foundational only. MVP.
- **US2**: US1 (GameView, start flow).
- **US3**: US1; host work T037–T042 and SDK work T043 can start right after Foundational, in their repositories, in parallel with US2/US4/US5; extension tasks T044–T055 wait for the SDK release. Uses imported games only if US5 is done (otherwise bundled games).
- **US4**: US1. Provides the database setup US5 extends.
- **US5**: US4 (T056 database setup).
- **US6**: US1 + T070 (H2).
- **US7**: US1.

### Within each story

- Pure modules with tests (`[P]`) first, then stores/composables, then components, then validation.
- Engine patches before the shell code that relies on their hooks.

## Parallel Examples

```text
Foundational:  T010 fetch-data.sh │ T011 haex_exports.c │ T012 haex_imports.c │ T014 configs │ T015 bundledGames.ts │ T016 wadLoader.ts │ T008 (haex-vault)
US1:           T026 AboutDialog.vue │ T027 locales           (after T020–T025 are underway)
US2:           T029 touchMapping.ts (+test) │ T033 haptic patch
US3:           T037–T042 (haex-vault) → T043 (vault-sdk)  ∥  T046 lobbyProtocol.ts │ T047 net_bridge.c
US4/US5:       T057 saveStore.ts │ T063 wad.ts
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 (slices 1–2) → DOOM playable on desktop in the vault. Stop and validate.
2. **Mobile**: US2 (slice 3) → demo on phones.
3. **Durability**: US4, then US5 (slices 4–5).
4. **Multiplayer**: start host/SDK work (slices 9–10) as soon as the MVP is merged; finish US3 (slice 11) once the SDK is released.
5. **Desktop comfort**: H2 + US6, US7 (slices 6–8).
6. Polish (T078–T080).
