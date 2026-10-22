# Research: haex-doom

Phase 0 of [plan.md](plan.md). Each entry gives the decision, why it was chosen, and what else was considered. Repository references to the vault host use the host repository `haex-space/haex-vault` (its source still carries the working name "holzi"; spec 054 there renames it); the commit those references were read at is noted under R-0.

## R-0 Which repository is the vault host

- **Decision**: All host changes go to `haex-space/haex-vault` (default branch `main`, read at `bdfc0bc90a74f49b2d8a30583c3e00b7b3f51742` on 2026-10-22). SDK references are to `haex-space/vault-sdk` at `0f1e16895d0a8021c234c4662fdd3296f7dac396` (v4.8.1). The repository `haex-space/haex-vault-legacy` is not touched.
- **Rationale**: The legacy repository is the former Tauri host; extensions released from this monorepo run in the current host, whose bridge (`src-tauri/src/extensions/bridge/allowlist.rs`) and frame (`src/components/extensions/ExtensionFrame.vue`) differ from the legacy one.
- **Alternatives considered**: none.

## R-1 Engine and how it is built

- **Decision**: Crispy DOOM, tag `crispy-doom-7.2` (commit `fdeabe4c23a833534b70aa84a22f1685aae7125d`, released 2026-10-12), built with its upstream Emscripten support (CMake target, inherited from chocolate-doom PR #1717) inside the pinned container image `emscripten/emsdk` (exact tag fixed in the first engine task, recorded in `apps/haex-doom/engine/build.sh`). SDL2 and SDL2_mixer from Emscripten ports; SDL2_net disabled and replaced by our own `net_sdl_module` (R-10). No pthreads, `ASYNCIFY=1`, `ALLOW_MEMORY_GROWTH=1`, `-O3`. Output: `crispy-doom.js` + `crispy-doom.wasm` (expected ~2.5 MB), written to `apps/haex-doom/public/engine/` by the build and not committed.
- **Rationale**: Upstream already builds for Emscripten (blocking `D_DoomLoop` + Asyncify, `OPL_Delay` → `emscripten_sleep`), so our patch set stays small: event entry point, file-written hooks, haptic hooks, network module. Shares Chocolate DOOM's netcode, raised limits, widescreen, uncapped frame rate.
- **Alternatives considered**: Cloudflare `doom-wasm` (Chocolate 3.0, squashed history, unmaintained since 2021, flags no longer valid for current Emscripten). Woof! (Boom/MBF21 but SDL3 + OpenAL Soft, no web port). DSDA-Doom (no usable netcode). `doomgeneric` (no sound).

## R-2 Building in CI and locally

- **Decision**: `apps/haex-doom/package.json` gets `engine:build` (runs `engine/build.sh` in the emsdk container; skipped when `public/engine/.stamp` matches the hash of upstream SHA + patches + our C sources) and `build` = `pnpm engine:build && nuxt build --preset static`. GitHub's Ubuntu runners have Docker, so the generic `extension-build.yml` and `extension-release.yml` need no change. Data files are fetched the same way (R-3).
- **Rationale**: No change to the spaex-generated Nix package list, no binaries in git, one command for developers and CI. pnpm does not run `pre*` scripts by default, hence the explicit chain.
- **Alternatives considered**: Committing the `.wasm` (binary churn in history); Emscripten via `.devshell/packages.nix` (an exclusive spaex atom slot, not ours to take).

## R-3 Bundled game data and package limits

- **Decision**: Bundle `freedoom1.wad.gz` (10.3 MB), `freedoom2.wad.gz` (10.9 MB) and `doom1.wad.gz` (~2 MB) under `public/wads/`, gzip-compressed at build time, decompressed at run time with the platform's `DecompressionStream('gzip')`. Sources are downloaded by `engine/fetch-data.sh` and verified by SHA-256: Freedoom 0.13.0 release zip (`3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59`), shareware `doom1.wad` v1.9 (SHA-1 `5b2e249b9c5133ec987b3ea77596381dc0d6bc1d`; the download URL and its SHA-256 are fixed in the task). Licence texts (`COPYING.txt` of Freedoom, the id shareware licence) ship next to them and in the About view.
- **Rationale**: Bundle limits (`vault-sdk` `crates/haex-bundle/src/format.rs:22-31`): 25 MiB per file, 64 MiB total. Raw Freedoom WADs are 28.8 MB each. Compressed, everything including the engine fits in ~26 MB. `DecompressionStream` is native in every target WebView, so no dependency.
- **Alternatives considered**: Splitting WADs into chunks (more code, same result); shipping only one Freedoom phase (loses content); downloading at run time (extension pages have `connect-src` limited to their own prefix).

## R-4 WebAssembly in extension frames (host change H1)

- **Decision**: Add `'wasm-unsafe-eval'` to `script-src` in the host's extension CSP (`src-tauri/src/extensions/protocol/csp.rs:91-102`), for all extensions.
- **Rationale**: Without it, `WebAssembly.instantiate` is refused. `'wasm-unsafe-eval'` allows compiling WebAssembly only, not JavaScript `eval`, so a per-extension opt-in would add a permission without reducing a meaningful risk.
- **Alternatives considered**: A manifest permission for WebAssembly (extra UI and code for no isolation gain).

## R-5 Pointer lock and fullscreen (host change H2)

- **Decision**: In `src/components/extensions/ExtensionFrame.vue`, extend `sandbox="allow-scripts"` with `allow-pointer-lock` and add `allow="fullscreen"`, for all extensions. The extension uses element fullscreen on its game container; when `document.fullscreenEnabled` is false or the request is rejected (Android WebView cancels custom views, `RustWebChromeClient.kt:48-50`), it falls back to filling the tab and hiding its own chrome. Pointer lock is offered only when `'requestPointerLock' in Element.prototype` and a lock attempt succeeds.
- **Rationale**: Both APIs need a user gesture and are always ended by Esc in the browser engine, so no permission is needed; this is the smallest host change. A host call for OS-level fullscreen of the main window is not needed for the spec's "fills the screen".
- **Alternatives considered**: A manifest permission (no added safety); a host SDK method to set the Tauri window fullscreen (extra capability `core:window:allow-set-fullscreen`; kept as an upgrade path).

## R-6 Keyboard shortcuts of the host

- **Decision**: Ship a default `crispy-doom.cfg` / `default.cfg` with a WASD layout (W/S move, A/D strafe, arrows turn, mouse turn + fire, E use, Ctrl and left mouse fire, always-run on) and no Alt-strafe binding.
- **Rationale**: The host's frame shim (`src-tauri/src/extensions/protocol/shim.rs:89-96`) swallows registered chords; the defaults are `Alt+ArrowLeft/Right` (tab navigation, `src/lib/actions/wmActions.ts:35-56`), which collide with DOOM's classic Alt-strafe. With always-run on, Shift chords never form either.
- **Alternatives considered**: A host "game mode" that suspends chords while a frame holds the pointer lock (host change, kept as upgrade path if users rebind to Alt).

## R-7 Input from the touch overlay and the shell

- **Decision**: Patch in one exported C function `haex_post_event(type, data1, data2, data3)` that calls `D_PostEvent`; the Vue touch overlay calls it via `Module.ccall`/`cwrap` with `ev_keydown`/`ev_keyup` (codes from `doomkeys.h`) and `ev_mouse` (turn delta). Stick deflection maps to forward/strafe key presses with analogue strength through `ev_joystick` (`data2`/`data3`), which Crispy already scales.
- **Rationale**: Crispy reads mouse motion with `SDL_GetRelativeMouseState`, so synthetic `MouseEvent`s without pointer lock do not turn the view; `D_PostEvent` bypasses SDL and works the same on every platform. Calling it while Asyncify sleeps matches how SDL's own callbacks enter the module.
- **Alternatives considered**: Dispatching synthetic `KeyboardEvent`s (what Cloudflare's site does; works for keys but not analogue turning).

## R-8 Persistence

- **Decision**:
  - **Save games** → a synced Drizzle table `saves` (prefixed `{publicKey}__haex-doom__saves`), binary via `{"$bytes": base64}` parameters. The engine writes `doomsavN.dsg` to MEMFS; a patch hook after the rename in `G_DoSaveGame` (`src/doom/g_game.c`) calls the shell with the path; the shell reads it with `FS.readFile` and upserts it. Saves for the active game are written into MEMFS before `callMain`.
  - **Engine config** (`crispy-doom.cfg`, `default.cfg`, text) and **shell settings** (haptics, touch sensitivity, last game) → the SDK's device-local `storage` (`getItem`/`setItem`, strings, 1 MiB per value). Hook at the end of `M_SaveDefaults`.
  - **Imported game files** → device-local tables `game_files_no_sync` (metadata) and `game_file_chunks_no_sync` (1 MiB chunks), never synced.
- **Rationale**: Extensions have no browser storage (opaque origin; `storage` is the host's replacement, `api/storage.ts:4-26`). Saves are small and the spec wants them on every device → synced table. Control settings legitimately differ per device (touch vs. mouse) → device-local. Game files of 14–20 MB through the CRDT sync would be heavy and duplicate copyrighted data across devices; importing once per device is acceptable. Volume and mouse sensitivity use the engine's own options menu, so the shell does not duplicate them.
- **Alternatives considered**: Filesystem API (`writeFile` to free paths fails on mobile, `fs/mod.rs:1-8`); remote storage (requires a user-configured S3/WebDAV/SFTP backend); syncing game files (see above).
- **Spec impact**: The assumption "imported game files are synced like other vault data" changes to "imported game files stay on the device they were imported on" (spec updated).

## R-9 Importing game files

- **Decision**: Pick the file with a plain `<input type="file">` inside the frame, read it with `File.arrayBuffer()`, validate in a pure TypeScript module (`app/lib/wad.ts`): header `IWAD`, lump directory inside the file, known lumps to identify the game (`MAP01` → DOOM II family; `E4M1` → The Ultimate DOOM; `E1M1` only → DOOM/shareware), known SHA-1 table for exact titles (DOOM II, TNT, Plutonia, …). `PWAD` is rejected as a modification file. Fingerprint: SHA-256 via `crypto.subtle`.
- **Rationale**: The SDK's `selectFile` + `readFile` caps the response at 16 MiB by default (base64 inflates by a third), which Final DOOM files exceed. A file input needs no permission and no host round trip; Android's WebView implements `onShowFileChooser` in the host (`RustWebChromeClient.kt:312`).
- **Verification needed in the task**: `crypto.subtle` requires a secure context; the custom scheme `holzi-ext://` must be checked on Linux/macOS/iOS. Fallback: a SHA-256 from a dependency already in the lockfile.

## R-10 Multiplayer transport (host change H3, SDK change S1)

- **Decision**:
  - **Topology**: the DOOM server runs in the host player's engine (`-privateserver`); each guest has one channel to the host (star). Up to 4 players (`MAXPLAYERS`).
  - **Engine side**: `net_bridge.c` provides `net_sdl_module` (SDL2_net disabled). `SendPacket`/`RecvPacket` call JS through `EM_JS`; each peer channel maps to one stable `net_addr_t*` (the server matches clients by pointer, `net_server.c:581`). Received packets are queued in JS and drained non-blockingly.
  - **Host side**: a new iroh ALPN `holzi-ext-peer/1` on the vault's `SyncNode` router (`src-tauri/src/sync/endpoint.rs:213-215`) carrying one QUIC connection per channel. DOOM packets travel as **QUIC datagrams** (unreliable; the engine resends itself). Lobby and invitation messages use a bidirectional stream with length-prefixed frames.
  - **Authentication**: mutual challenge like `sync/handshake.rs` (both sides sign nonces and both endpoint ids with their device key); the remote device must appear in the signed Visitenkarte of one of the local user's contacts (`haex_contacts_cards`). Unknown devices are refused.
  - **Addressing**: the inviting host resolves the invited contact's `devices[].endpoint_id` / `iroh_relay` from the stored card and adds them to `MemoryLookup` (pattern of `dial_link`, `endpoint.rs:261-267`). Relays: the vault's configured iroh relays (`sync/servers.rs:112-135`).
  - **Extension isolation**: every connection is bound to one extension identity (public key + name). The receiving host delivers only to frames of the same extension.
  - **Permission**: a new permission kind `peers` with action `connect` (`permissions/model.rs`, pattern of commit `732bc5fe` for contacts), plus `contacts: read` so the extension can list contacts that carry vault addresses.
- **Rationale**: Uses the iroh endpoint every open vault already runs, its relays, and its signed contact cards; datagrams match the engine's UDP design and avoid head-of-line blocking. Traffic is end-to-end encrypted by QUIC/TLS between device keys.
- **Alternatives considered**: Reliable streams for game packets (stutter on loss); a central WebSocket relay like Cloudflare's (a server to run, not peer to peer); mesh topology (the engine is client/server).

## R-11 Invitations

- **Decision**: `peers.invite(contactId, payload)` makes the inviting host dial the contact's devices and send an `Invite` frame naming the extension. The receiving host checks that the extension is installed and enabled and that the inviter is a contact; if the extension's frame is open it emits `peers:invitation` to it, otherwise it shows a vault notification whose action opens the extension tab with `?invite=<id>` (the frame shim's `navigate`). The invitee accepts or declines in the extension; the inviter gets `peers:invite-status` (`accepted`, `declined`, `not-installed`, `unreachable`, `expired`).
- **Rationale**: There is no cross-vault delivery mechanism in the host today (spaces and data shares are drafts); the invitation reuses the same connection that later carries the game.
- **Alternatives considered**: Nostr gift-wrap mailbox (only implemented for one's own devices).

## R-11a Lobby visibility and join codes (clarified 2026-10-22)

- **Decision**: The host's vault registers each open lobby (`peers.openLobbyAsync`) and returns a join code `haexpeer1:` + base32 `{ endpoint_id, relay_url, lobby_id, secret }` with a 128-bit random secret. A joiner's vault dials the endpoint (adding the relay to `MemoryLookup`) and sends `Join`. The host's vault admits only while the lobby is open, with a constant-time secret match, and — for contacts-only lobbies — only verified contacts; removed devices are banned per lobby. Non-contact connections on the ALPN are accepted only while a public lobby is open and must send `Join` within 5 s. Invitations stay contacts-only and are dialed to all of a contact's devices in parallel; the first acceptance wins and the others receive `Withdraw`.
- **Rationale**: A bare endpoint id is not a secret (it is in every contact card) and identifies a device, not a game; a per-lobby secret makes the code a short-lived capability, the same idea as iroh tickets. One code for both visibilities keeps one join path; visibility only changes the admission check. No browsable list of contacts' games, because that would require polling every contact device and reveal who is online.
- **Alternatives considered**: Joining by bare endpoint id (permanent, device-wide exposure); browsing open games of all contacts (polling cost, presence leak); invitations from non-contacts (spam).
- **Privacy note**: In a public lobby, directly connected players learn the host's network address; the lobby says so.

## R-17 Save conflicts between devices (clarified 2026-10-22)

- **Decision**: `saves.id` = `<game_fingerprint>:<slot>`, written as an upsert, so both devices write the same row and the sync keeps the later write. The task verifies how the host's sync orders concurrent writes to one row (per-row or per-column last-writer-wins) and that `saved_at` and `data` cannot end up from different writes; if they can, all columns are written in one statement and the row is treated as a unit there.
- **Rationale**: Random ids would create two rows for one slot after a sync and break the uniqueness of (game, slot).

## R-12 Local-network discovery

- **Decision**: Not built. Players on the same network are invited as contacts like everyone else; iroh exchanges local addresses through the relay during connection setup and then connects directly on the LAN.
- **Rationale**: The host has no mDNS discovery (`sync/endpoint.rs` uses `MemoryLookup` only). Adding it plus a join-request flow is a large host change, and the latency benefit is already achieved by iroh's direct paths.
- **Alternatives considered**: mDNS lookup in the host (upgrade path).
- **Spec impact**: FR-029 and US3 scenario 3 are removed (spec updated).

## R-13 Bridge throughput

- **Decision**: Accept one bridge call per outgoing datagram and one frame event per incoming datagram at first (host: 3 guests × 35 = ~105 packets/s each way), and measure against SC-010. Upgrade path, marked with a `ponytail:` comment: batch datagrams per animation frame in `peers.send` and per 5 ms in host events.
- **Rationale**: Each call goes `postMessage` → `invoke('extension_bridge_call')` → `spawn_blocking` + an `is_enabled` DB read (`bridge/dispatch.rs:49-66`); sub-millisecond each, well inside a 28 ms tic.

## R-14 Audio on mobile

- **Decision**: The start screen's tap calls `Module.SDL2.audioContext.resume()` (or creates the context) synchronously inside the gesture handler, and sets `navigator.audioSession.type = 'playback'` where available (iOS 17+). Music via OPL emulation (`snd_musicdevice 3`), no MIDI.
- **Rationale**: SDL2's Emscripten audio resumes the context only by polling user activation, which WKWebView may refuse outside a gesture. The Emscripten SDL2_mixer port has no MIDI support by default.

## R-15 Gamepad

- **Decision**: Rely on the engine's SDL game-controller support (SDL2's Emscripten backend reads the Gamepad API); ship the default mapping in the default config.
- **Rationale**: No shell code needed; verified in the gamepad task, with a shell-side Gamepad API mapping to `haex_post_event` as fallback.

## R-16 graphify consultation

- `graphify query "persist extension data blobs and settings in the vault" --budget 1200` in this repository: 262 matches, none reusable for a game engine bridge, WAD validation or peer channels (hits: haex-pass-browser vault client, calendar settings schema, release scripts, haex-draw `dataUrl.ts`). New artifacts in this feature are independent; each implementation task re-consults the graph of the repository it changes (haextension, haex-vault, vault-sdk) before authoring.
