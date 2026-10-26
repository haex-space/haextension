# Contract: engine ↔ shell

The interface between the WebAssembly engine (Crispy DOOM plus our patches in `apps/haex-doom/engine/`) and the Vue shell (`apps/haex-doom/app/`). It is the only coupling between the two; everything else goes through the engine's command line and MEMFS.

## Start

The shell loads `engine/crispy-doom.js` and creates the module with:

| Module option | Value |
|---|---|
| `canvas` | The game `<canvas>`. |
| `haexImports` | The shell's handlers for the engine's imports (below). |
| `SDL2.audioContext` | The `AudioContext` created in the start gesture; SDL plays through it. |
| `onExit` / `onAbort` | Back to the start screen; the engine is linked with `EXIT_RUNTIME`, so Quit reaches `onExit`. |

The engine is linked with `INVOKE_RUN=0`, so the shell calls `callMain(args)` after preparing MEMFS, and `crispy-doom.wasm` is found next to `crispy-doom.js` without a `locateFile`.

Before `callMain`, the shell writes into MEMFS:

| Path | Content |
|---|---|
| `/wads/<file_name>` | The decompressed (bundled) or reassembled (imported) game file. |
| `/config/default.cfg`, `/config/crispy-doom.cfg` | From `storage` (`engine:*` keys) or the bundled defaults; the paths are passed with `-config` and `-extraconfig` (below). |
| `/saves/<game_fingerprint>/doomsav<slot>.dsg` | The active game's saves from the `saves` table. |

Arguments (`callMain`):

```text
-iwad /wads/<file_name> -config /config/default.cfg -extraconfig /config/crispy-doom.cfg
-savedir /saves/<game_fingerprint>/
[single player]  -skill <n> (optional) 
[multiplayer host]  -privateserver -nodes <players> -skill <n> -warp <map>   (Doom II family)
                    -privateserver -nodes <players> -skill <n> -warp <episode> <map>   (DOOM / Freedoom Phase 1)
                    [deathmatch: -altdeath [-nomonsters] [-timer <10|20>]]
[multiplayer guest] -connect host
```

## Shell → engine (exported C functions, called via `cwrap`)

| Function | Signature | Meaning |
|---|---|---|
| `haex_post_event` | `void (int type, int data1, …, int data6)` | Calls `D_PostEvent` with the fields of `event_t`. `type`: 0 `ev_keydown`, 1 `ev_keyup`, 2 `ev_mouse`, 3 `ev_joystick` (values of `evtype_t` in upstream `src/d_event.h`). Key codes from `doomkeys.h`. `ev_mouse`: `data2` = horizontal turn delta (8 angle units per unit at default sensitivity). `ev_joystick`: `data1` = button bits (indices are the `joyb_*` config values), `data2` = turn, `data3` = move (positive = backward), `data4` = strafe, each −65536…65536 (`FRACUNIT`), `data6` = direction bits (`JOY_DIR_*` of `src/i_joystick.h`, left stick at shift 4) that drive the menus. The engine keeps the last joystick state until the next event or level load; the menus and the automap act on every event, so the shell sends menu directions and the Menu/Map buttons only on the event where they change. |
| `haex_set_mouse_motion` | `void (int enabled)` | Enables or drains Crispy's SDL relative-motion producer. The shell disables it while pointer lock is active because it posts the locked movement itself; mouse button events remain handled by SDL. |
| `haex_set_paused` | `void (int paused)` | Pauses or resumes a single-player game (FR-006); ignored in netgames. |
| `haex_net_peer_closed` | `void (int peer)` | A peer channel closed; the engine treats it like a timed-out node, at once instead of after 30 s of silence (below). Takes effect at the engine's next poll of the network module. |
| `haex_debug_game` | `int (int what)` | Read-only probe: 0 `gametic`, 1 `leveltime`, 2 players in the game (bit n = player n), 3 console player, 4 netgame, 5 position in the random table. For the measurements of T054 and `engine/e2e`; the shell does not need it. |
| `haex_debug_player` | `int (int player, int field)` | Read-only probe: 0 x, 1 y, 2 angle, 3 health of a player. |

## Engine → shell (`EM_JS` imports, implemented in `app/lib/engine/imports.ts`)

| Function | When | Shell action |
|---|---|---|
| `haex_file_written(const char *path)` | After `G_DoSaveGame` renamed the save into place; at the end of `M_SaveDefaults`. | Reads the file with `FS.readFile` and persists it (`saves` table or `storage`). A failed save is shown to the user and does not stop the game (FR-020); a failed config write is only logged. |
| `haex_file_removed(const char *path)` | After the save menu deleted a save (`M_ConfirmDeleteGameResponse`). | Deletes the save's row from the `saves` table; a failure is shown to the user. |
| `haex_haptic(int kind)` | 0 = player fired (`P_FireWeapon`), 1 = player damaged (`P_DamageMobj` on the console player). | `navigator.vibrate` with 15 ms / 40 ms if haptics are on (FR-014). |
| `haex_net_active() → int` | `net_sdl_module.InitServer`/`InitClient`, at the start of a netgame. | `netActive`: true while the shell has a peer session for this game (its lobby has connected players or the host's channel). Default false. |
| `haex_engine_exit(int is_error, const char *message)` | In `I_Error` (before `exit(-1)`; the message box is replaced by this call) and `I_Quit` (before `exit(0)`), which then ends the module through `onExit`. | `engineExit`: `useEngine` records `lastExit = { isError, message }` and the module is torn down by `onExit`. `isError`: text of `I_Error` (e.g. `consistency failure (81 should be 92)`, `Unable to start the network module`); otherwise a Quit, with the message `Disconnected from the host.` when a guest lost the host (left, quit, or 30 s of silence), else empty. The shell turns these into its own, translated notice. |
| `haex_net_send(int peer, const uint8_t *data, int len)` | `net_sdl_module.SendPacket`. | Copies the bytes and sends them on the peer's channel as a datagram. |
| `haex_net_recv(uint8_t *buf, int cap) → int` | `net_sdl_module.RecvPacket`, polled in every network update of the engine (each frame, and in the loops that wait for the connect and the launch). | `netRecv`: writes the next queued datagram (4-byte little-endian peer number, then the packet; `cap` is 1,028) and returns the total length, or 0 when the queue is empty; it never waits. The shell keeps datagrams queued until the engine polls (a guest's first SYNs can arrive while the host's engine still loads) and drops those with more than 1,024 bytes of payload. |
| `haex_net_resolve(const char *name) → int` | `net_sdl_module.ResolveAddress`. | `"host"` on a guest → peer number of the host channel; anything else → −1 (no such address). |

## Network module rules (`engine/src/net_bridge.c`)

- Exactly one `net_addr_t` per peer number, created on first use and reused for every packet from that peer (the server matches clients by pointer).
- `FreeAddress` releases the mapping only; the channel itself is closed by the shell.
- Packets larger than 1,024 bytes are dropped and logged (the vault's limit for fast messages); DOOM packets stay far below it.
- `InitServer`/`InitClient` succeed only when the shell reports an active peer session (`haex_net_active`); the server and the `-connect` path then end with `I_Error("Unable to start the network module")`.
- Peer numbers are non-negative integers of the shell's choosing, stable for the life of a channel and not reused for another channel during a game. Each side numbers its peers itself; the numbers do not have to agree.
- A guest's client waits 30 s (upstream: 5 s) for the host's answer to its SYN, because the host's engine may still be loading.
- `haex_net_peer_closed(peer)`: on the host the client behind that peer is deactivated at the engine's next poll; the others continue (their tic data no longer waits for it) and see "Player N left the game". On a guest, when the peer is the host, the engine ends with `I_Quit` and the notice `Disconnected from the host.`. A peer that vanishes without a close event is dropped by the engine's own 30 s timeout (FR-033). When the host quits, its engine tells the guests itself (disconnect packets sent before its exit), so the guests end even if the shell's close event comes later; the shell must not close the channels before the host's `onExit`.
