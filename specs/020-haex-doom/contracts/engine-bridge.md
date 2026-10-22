# Contract: engine ↔ shell

The interface between the WebAssembly engine (Crispy DOOM plus our patches in `apps/haex-doom/engine/`) and the Vue shell (`apps/haex-doom/app/`). It is the only coupling between the two; everything else goes through the engine's command line and MEMFS.

## Start

The shell loads `engine/crispy-doom.js` and creates the module with:

| Module option | Value |
|---|---|
| `canvas` | The game `<canvas>`. |
| `noInitialRun` | `true`; the shell calls `callMain(args)` after preparing MEMFS. |
| `locateFile` | Resolves `crispy-doom.wasm` relative to the extension prefix. |
| `print` / `printErr` | Forwarded to the shell log in debug builds only. |

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
[multiplayer host]  -privateserver -nodes <players> -skill <n> -warp <map>
                    [deathmatch: -altdeath [-nomonsters] [-timer <10|20>]]
[multiplayer guest] -connect host
```

## Shell → engine (exported C functions, called via `cwrap`)

| Function | Signature | Meaning |
|---|---|---|
| `haex_post_event` | `void (int type, int data1, int data2, int data3, int data4)` | Calls `D_PostEvent`. `type`: 0 `ev_keydown`, 1 `ev_keyup`, 2 `ev_mouse`, 3 `ev_joystick` (values of `evtype_t` in upstream `src/d_event.h`). Key codes from `doomkeys.h`. `ev_mouse`: `data2` = horizontal turn delta. `ev_joystick`: `data2` = turn, `data3` = forward, `data4` = strafe axis, −32768…32767. |
| `haex_set_paused` | `void (int paused)` | Pauses or resumes a single-player game (FR-006); ignored in netgames. |
| `haex_net_peer_closed` | `void (int peer)` | A peer channel closed; the engine treats it like a timed-out node. |

## Engine → shell (`EM_JS` imports, implemented in `app/lib/engine/imports.ts`)

| Function | When | Shell action |
|---|---|---|
| `haex_file_written(const char *path)` | After `G_DoSaveGame` renamed the save into place; at the end of `M_SaveDefaults`. | Reads the file with `FS.readFile` and persists it (`saves` table or `storage`). A failure is shown to the user and does not stop the game (FR-020). |
| `haex_haptic(int kind)` | 0 = player fired (`P_FireWeapon`), 1 = player damaged (`P_DamageMobj` on the console player). | `navigator.vibrate` with 15 ms / 40 ms if haptics are on (FR-014). |
| `haex_net_send(int peer, const uint8_t *data, int len)` | `net_sdl_module.SendPacket`. | Copies the bytes and sends them on the peer's channel as a datagram. |
| `haex_net_recv(uint8_t *buf, int cap) → int` | `net_sdl_module.RecvPacket`, polled. | Writes the next queued datagram (prefixed by a 4-byte little-endian peer number) and returns its length, or 0 when the queue is empty. |
| `haex_net_resolve(const char *name) → int` | `net_sdl_module.ResolveAddress`. | `"host"` on a guest → peer number of the host channel; anything else → −1 (no such address). |

## Network module rules (`engine/src/net_bridge.c`)

- Exactly one `net_addr_t` per peer number, created on first use and reused for every packet from that peer (the server matches clients by pointer).
- `FreeAddress` releases the mapping only; the channel itself is closed by the shell.
- Packets larger than 1,024 bytes are dropped and logged (the vault's limit for fast messages); DOOM packets stay far below it.
- `InitServer`/`InitClient` succeed only when the shell reports an active peer session.
