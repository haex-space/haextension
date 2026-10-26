# Quickstart: validating haex-doom

How to build the extension and prove each user story end to end. Details of interfaces are in [contracts/](contracts/), data in [data-model.md](data-model.md).

## Prerequisites

- Node 22 and pnpm (repository toolchain), Docker (for the pinned Emscripten image).
- A haex-vault build that contains host change H1 (WebAssembly in frames). US6 additionally needs H2, US3 needs H3 and an SDK release with S1.
- For mobile: the vault on an Android or iOS device; for multiplayer: two or more vaults whose users have exchanged their Visitenkarten (contact cards).

## Build and run

```sh
pnpm install
pnpm --filter haex-doom engine:build   # first run pulls the emsdk image and builds crispy-doom.wasm
pnpm --filter haex-doom test           # unit tests (vitest)
pnpm --filter haex-doom exec vue-tsc --noEmit
pnpm --filter haex-doom ext:dev        # dev server on its port, load it as a dev extension in the vault
pnpm --filter haex-doom build:release  # signed .xt package, as CI does
```

Expected: `engine:build` writes `apps/haex-doom/public/engine/crispy-doom.{js,wasm}` and `public/wads/*.wad.gz`; a second run without changes finishes at once (stamp matches). The `.xt` stays under 64 MiB with no file over 25 MiB.

## Scenarios

| Story | Steps | Expected |
|---|---|---|
| US1 desktop keyboard | Open the extension, tap "DOOM (shareware)", start. Play E1M1 with W/A/S/D, arrows, Ctrl, E, 1–7, Tab, Esc. Click another tab. | Title music plays after the tap; all keys act; the game pauses and is silent while the tab is in the background; `Alt+ArrowLeft` still switches tabs without disturbing the game. |
| US1 limits | Open on a vault without H1. | Start screen says the vault must be updated; no console errors beyond that. |
| US2 touch | On a phone, start Freedoom: Phase 1, finish the first map using only the overlay. Turn the phone to portrait. Connect a Bluetooth keyboard and press a key. | Two-thumb control works simultaneously; fire/damage vibrate (off when the setting is off); portrait shows the rotate prompt; the overlay hides on keyboard input and returns on the next touch. |
| US3 multiplayer | Vault A invites contact B (phone) and C; both accept; A starts cooperative E1M1. Then C closes the extension. Then A leaves. | All three spawn in the same map within 60 s of the invitation; C's departure shows a notice and A and B continue; A leaving ends the game for B with a notice. Repeat with a fourth player in deathmatch for 10 minutes: no consistency failure. |
| US3 join code | A opens a public lobby and shares its code; D (not A's contact) joins with it. A switches a second lobby to contacts-only; D tries its code. A removes a player. A starts; someone uses the old code. B (two devices open) is invited. | D joins marked "not verified"; D is refused for the contacts-only lobby; the removed player cannot rejoin; the old code says the game is no longer open; B's invitation shows on both devices and vanishes from the second once accepted on the first. |
| US3 deathmatch options | A hosts deathmatch with defaults, then with monsters on and no time limit. | Defaults: no monsters, items respawn, level ends after 10 minutes with the frag table; second game has monsters and no limit. |
| US3 mismatch | B has not imported DOOM II; A invites B to a DOOM II game. | B sees "DOOM II is missing on this device" and cannot join. |
| US4 saves | Save in slot 1 with a name, restart the vault, load. Save on device 1, open the extension on device 2 after sync. With both devices offline, save slot 2 on device 1, then slot 2 on device 2, then let them sync. | Same level, health, inventory; the save shows up on device 2; saves of other games are not listed; slot 2 holds device 2's (later) save on both devices, and only one entry. |
| US4 settings | Change music volume in the engine menu and haptics in the shell settings; restart. | Both are restored on that device. |
| US5 import | Import `DOOM2.WAD`; import it again; import a PNG and a PWAD; remove DOOM II. | DOOM II listed with its title; second import says "already available"; PNG and PWAD rejected with reasons and nothing stored; removal frees the entry, saves remain. |
| US6 mouse/fullscreen | On desktop with H2: click into the game, move the mouse, left-click, Esc; toggle fullscreen. | Mouse turns and fires; Esc releases the cursor and opens the menu; fullscreen fills the screen and Esc leaves it. Without H2: options hidden, keyboard play unaffected. |
| US7 gamepad | Connect a standard gamepad and play a map. Disconnect it. | Sticks move/turn, trigger fires; disconnect pauses a single-player game. |
| SC-002 speed | Tap the title "DOOM" seven times on the start screen, then "Speed check" (runs `-timedemo demo1`), on a mid-range phone. | Reported speed ≥ 35 tics/s with no audio dropouts. |
