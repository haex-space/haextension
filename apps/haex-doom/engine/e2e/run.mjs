// End-to-end check of the lockstep over the engine bridge (US3, FR-031 to FR-034): several
// engine instances run in pages of one browser, wired to each other through the JS loopback of
// harness.js, and play a netgame with the bridge as the only transport.
//
//   pnpm --filter haex-doom engine:build
//   node engine/e2e/run.mjs [scenario ...] [--seconds 70] [--keep-open]
//
// Needs a Chromium (CHROMIUM, default /usr/bin/chromium); `playwright-core` is a dev dependency of this
// app and only drives that browser (PLAYWRIGHT_CORE points at another copy of it, if wanted). Scenarios: coop, coop-doom1, deathmatch, latency, four,
// guest-leaves, guest-leaves-silently, host-leaves, host-quits, no-session, consistency-failure, timedemo, and for one
// player: jump, quit-us, quit-layout, save-layout, move-layout (keyboard layouts, see `typeKey`). No scenario runs all.
// Exit code 1 when a scenario fails.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../../public");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".cfg": "text/plain", ".gz": "application/gzip" };

async function loadPlaywright() {
  const location = process.env.PLAYWRIGHT_CORE;
  if (location) {
    return createRequire(join(location, "package.json"))(location);
  }
  return (await import("playwright-core")).default;
}

function serve() {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const base = path === "/harness.html" || path === "/harness.js" ? here : publicDir;
    const file = normalize(join(base, path));
    if (!file.startsWith(base)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file");
      response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Waits until `test` is true or the time runs out; returns whether it became true.
async function until(test, timeoutMs, stepMs = 250) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await test()) return true;
    await sleep(stepMs);
  }
  return false;
}

class Player {
  constructor(context, origin, id, options) {
    this.id = id;
    this.context = context;
    this.origin = origin;
    this.options = options;
  }

  async open() {
    const { wad, args, latency = 0, loss = 0, tamper = 0 } = this.options;
    this.page = await this.context.newPage();
    this.consoleErrors = [];
    this.page.on("pageerror", (error) => this.consoleErrors.push(String(error)));
    const query = new URLSearchParams({ id: this.id, wad, args: JSON.stringify(args), latency, loss, tamper });
    await this.page.goto(`${this.origin}/harness.html?${query}`);
  }

  read(expression, argument) {
    return this.page.evaluate(expression, argument).catch(() => null);
  }

  state() {
    return this.read(() => window.__harness.state());
  }

  result() {
    return this.read(() => ({ ...window.__harness.result }));
  }

  stats() {
    return this.read(() => ({ ...window.__harness.stats }));
  }

  history() {
    return this.read(() => window.__harness.history.slice());
  }

  log() {
    return this.read(() => window.__harness.log.slice());
  }

  leave() {
    return this.page.evaluate(() => window.__harness.leave());
  }

  async inLevel() {
    const state = await this.state();
    return Boolean(state && state.netgame === 1 && state.leveltime > 10);
  }

  async hasExited() {
    return Boolean((await this.result())?.exited);
  }
}

// The state fields in harness.js `history` rows.
const COLUMNS = ["tic", "leveltime", "players", "prnd", "x0", "y0", "angle0", "health0", "x1", "y1", "angle1", "health1"];

// Compares the rows two players recorded for the same game tic; returns { common, differing, first }.
function compareHistories(a, b) {
  const byTic = new Map(b.map((row) => [row[0], row]));
  let common = 0;
  let differing = 0;
  let first = null;
  for (const row of a) {
    const other = byTic.get(row[0]);
    if (!other) continue;
    common++;
    // The set of players in the game may differ between two samples of one tic only when a
    // player left; the positions, health and random index must agree.
    const same = row.every((value, index) => index === 2 || value === other[index]);
    if (!same) {
      differing++;
      first ??= { tic: row[0], a: Object.fromEntries(COLUMNS.map((c, i) => [c, row[i]])), b: Object.fromEntries(COLUMNS.map((c, i) => [c, other[i]])) };
    }
  }
  return { common, differing, first };
}

const HOST_ARGS = ["-privateserver", "-nodes", "2", "-skill", "3", "-warp", "1"];
const GUEST_ARGS = ["-connect", "host"];

function guestIds(count) {
  return Array.from({ length: count }, (_, i) => `g${i + 1}`);
}

// A running netgame: one host and `guests` guests.
async function startGame(context, origin, { tamperGuest = 0, guests = 1, hostArgs = HOST_ARGS, wad = "freedoom2", latency = 0, loss = 0, startTimeoutMs = 120_000 } = {}) {
  const nodes = String(guests + 1);
  const args = hostArgs.map((arg, i, all) => (all[i - 1] === "-nodes" ? nodes : arg));
  const players = [new Player(context, origin, "host", { wad, args, latency, loss })];
  for (const id of guestIds(guests)) {
    players.push(new Player(context, origin, id, { wad, args: GUEST_ARGS, latency, loss, tamper: id === "g1" ? tamperGuest : 0 }));
  }
  for (const player of players) await player.open();
  const reached = await until(async () => (await Promise.all(players.map((p) => p.inLevel()))).every(Boolean), startTimeoutMs, 500);
  return { players, reached, host: players[0], guests: players.slice(1) };
}


// One single-player engine on its first map, without monsters and without the bot, driven through the page's keyboard.
async function soloGame(context, origin, { cfg = {}, args = [], wad = "freedoom2", startTimeoutMs = 60_000 } = {}) {
  const player = new Player(context, origin, "solo", { wad, args: ["-skill", "3", "-warp", "1", "-nomonsters", ...args] });
  const page = await context.newPage();
  player.page = page;
  player.consoleErrors = [];
  page.on("pageerror", (error) => player.consoleErrors.push(String(error)));
  const query = new URLSearchParams({ id: "host", wad, args: JSON.stringify(player.options.args), bot: "0", session: "0", cfg: JSON.stringify(cfg) });
  await page.goto(`${origin}/harness.html?${query}`);
  const reached = await until(async () => ((await player.state())?.leveltime ?? 0) > 35, startTimeoutMs, 250);
  const cdp = await context.newCDPSession(page);
  await page.bringToFront();
  return { player, page, cdp, reached, game: { players: [player] } };
}

// Keyboard layouts the way Chromium reports them: `code` is the physical key (the US position), `key` the character the layout
// puts there, `vk` the layout's virtual key code (the keyCode of the DOM event, which SDL turns into its keysym).
// Playwright's own press() always reports the US layout, so the other layouts go through the DevTools protocol.
const LAYOUTS = {
  // The key labelled Y sits where the US layout has Z, and the other way round.
  qwertz: { KeyY: ["z", 90], KeyZ: ["y", 89] },
  // The key labelled A sits where the US layout has Q, Z where it has W, and so on.
  azerty: { KeyQ: ["a", 65], KeyA: ["q", 81], KeyW: ["z", 90], KeyZ: ["w", 87], Semicolon: ["m", 77], KeyM: [",", 188] },
};

function keyFor(layout, code) {
  const entry = LAYOUTS[layout]?.[code];
  if (entry) return entry;
  // Letters not listed are the same as on the US layout.
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter) return [letter.toLowerCase(), letter.charCodeAt(0)];
  throw new Error(`no key for ${code}`);
}

/** The key at physical position `code` goes down (and up, unless `hold`) on the given layout. */
async function typeKey(cdp, layout, code, { hold = 0 } = {}) {
  const [key, vk] = keyFor(layout, code);
  const base = { code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, text: key });
  if (hold) await sleep(hold);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

/** The character `text` on `layout`, found by its position: pressing the key that produces it. */
function positionOf(layout, character) {
  const table = LAYOUTS[layout] ?? {};
  const found = Object.entries(table).find(([, [key]]) => key === character);
  if (found) return found[0];
  return `Key${character.toUpperCase()}`;
}

async function typeText(cdp, layout, text) {
  for (const character of text) {
    if (character === " ") {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "Space", key: " ", text: " ", windowsVirtualKeyCode: 32 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "Space", key: " ", windowsVirtualKeyCode: 32 });
    } else {
      await typeKey(cdp, layout, positionOf(layout, character));
    }
    await sleep(120);
  }
}

// Player position in map units (haex_debug_player: 0 x, 1 y, 2 angle, 3 health, 4 z, 5 momz).
const FIXED = 65536;
const at = async (player) => ({
  x: (await player.read(() => window.__harness.playerField(0))) / FIXED,
  y: (await player.read(() => window.__harness.playerField(1))) / FIXED,
  z: (await player.read(() => window.__harness.playerField(4))) / FIXED,
});

// Presses `press` and samples the height of the player for `ms`; returns the lowest and highest z seen and the last one.
async function heightsDuring(player, press, ms) {
  const heights = [];
  const sampler = (async () => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      heights.push((await player.read(() => window.__harness.playerField(4))) / FIXED);
      await sleep(8);
    }
  })();
  await sleep(100);
  await press();
  await sampler;
  return { min: Math.min(...heights), max: Math.max(...heights), last: heights.at(-1), samples: heights.length };
}

const report = [];
function note(line) {
  report.push(line);
  console.log(line);
}

async function describe(players) {
  const rows = [];
  for (const player of players) {
    const [state, stats, result] = await Promise.all([player.state(), player.stats(), player.result()]);
    rows.push(`${player.id}: tic ${state?.tic} leveltime ${state?.leveltime} players ${state?.players?.toString(2)} sent ${stats?.sent} received ${stats?.received} dropped ${stats?.dropped} maxSize ${stats?.maxSize} exit ${JSON.stringify(result?.exit)}`);
  }
  return rows.join("\n    ");
}

async function dumpLog(player, lines = 25) {
  const log = (await player.log()) ?? [];
  console.log(`--- ${player.id} log (last ${lines}) ---\n${log.slice(-lines).join("\n")}`);
}

// Lets the game run and checks, every few seconds, that the tics advance and nobody exited.
async function playFor(players, seconds) {
  const started = Date.now();
  const first = await Promise.all(players.map((p) => p.state()));
  let stalled = null;
  let last = first;
  while (Date.now() - started < seconds * 1000) {
    await sleep(5000);
    const now = await Promise.all(players.map((p) => p.state()));
    const exited = (await Promise.all(players.map((p) => p.hasExited()))).findIndex(Boolean);
    if (exited >= 0) return { ok: false, why: `${players[exited].id} exited`, first, last: now };
    now.forEach((state, i) => {
      if (state.tic <= last[i].tic) stalled ??= `${players[i].id} stalled at tic ${state.tic}`;
    });
    last = now;
  }
  return { ok: stalled === null, why: stalled, first, last, seconds: (Date.now() - started) / 1000 };
}

async function verifyLockstep(players, played) {
  let ok = played.ok;
  if (!played.ok) note(`  FAIL: ${played.why}`);
  const histories = await Promise.all(players.map((p) => p.history()));
  for (let i = 1; i < players.length; i++) {
    const { common, differing, first } = compareHistories(histories[0], histories[i]);
    note(`  host vs ${players[i].id}: ${common} common tics compared, ${differing} differing`);
    if (common < 100 || differing > 0) {
      ok = false;
      note(`  FAIL: ${common < 100 ? "too few common tics" : `state differs, first at ${JSON.stringify(first)}`}`);
    }
  }
  // The bot must have moved the players, or equal states would prove little.
  const moved = (column) => new Set(histories[0].map((row) => row[column])).size;
  note(`  host's view: ${moved(4)} distinct x positions of player 1, ${moved(8)} of player 2, ${moved(3)} random-table positions`);
  if (moved(4) < 20 || moved(8) < 20) {
    ok = false;
    note("  FAIL: the players hardly moved");
  }
  played.first.forEach((first, i) => {
    const advanced = played.last[i].tic - first.tic;
    note(`  ${players[i].id}: tic ${first.tic} -> ${played.last[i].tic} (+${advanced}, ${(advanced / played.seconds).toFixed(1)} tics/s over ${played.seconds.toFixed(0)} s)`);
  });
  note(`  ${await describe(players)}`);
  for (const player of players) {
    const stats = await player.stats();
    if (stats?.oversize > 0) {
      ok = false;
      note(`  FAIL: ${player.id} sent ${stats.oversize} datagrams over 1,024 bytes`);
    }
    const exit = (await player.result())?.exit;
    if (exit) {
      ok = false;
      note(`  FAIL: ${player.id} reported exit ${JSON.stringify(exit)}`);
    }
  }
  return ok;
}

const scenarios = {
  async coop({ context, origin, seconds }) {
    const game = await startGame(context, origin);
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const played = await playFor(game.players, seconds);
    return { ok: await verifyLockstep(game.players, played), game };
  },

  // The episodic games take the episode and the map: `-warp 1 1`.
  async "coop-doom1"({ context, origin, seconds }) {
    const game = await startGame(context, origin, { wad: "doom1", hostArgs: ["-privateserver", "-nodes", "2", "-skill", "3", "-warp", "1", "1"] });
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const played = await playFor(game.players, Math.min(seconds, 30));
    return { ok: await verifyLockstep(game.players, played), game };
  },

  async deathmatch({ context, origin, seconds }) {
    const game = await startGame(context, origin, { hostArgs: [...HOST_ARGS, "-altdeath", "-nomonsters", "-timer", "10"] });
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const played = await playFor(game.players, seconds);
    return { ok: await verifyLockstep(game.players, played), game };
  },

  // Control for the checks: g1 sends corrupted commands, so its game diverges, and the engine
  // must end the game with its consistency failure through the exit hook (FR-034).
  async "consistency-failure"({ context, origin }) {
    const game = await startGame(context, origin, { tamperGuest: 30 });
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const ended = await until(async () => (await Promise.all(game.players.map((p) => p.hasExited()))).some(Boolean), 60_000, 250);
    await sleep(3000);
    const exits = await Promise.all(game.players.map((p) => p.result()));
    game.players.forEach((p, i) => note(`  ${p.id}: exited=${exits[i].exited} exit ${JSON.stringify(exits[i].exit)}`));
    return { ok: ended && exits.some((r) => r.exit?.isError && /consistency/i.test(r.exit.message)), game };
  },

  // A connection round trip of 150 ms (75 ms each way) with 2 % of the datagrams lost (SC-010).
  async latency({ context, origin, seconds }) {
    const game = await startGame(context, origin, { latency: 75, loss: 2 });
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const played = await playFor(game.players, seconds);
    return { ok: await verifyLockstep(game.players, played), game };
  },

  // The maximum of four players (host and three guests).
  async four({ context, origin, seconds }) {
    const game = await startGame(context, origin, { guests: 3, hostArgs: [...HOST_ARGS, "-altdeath", "-nomonsters", "-timer", "10"] });
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const played = await playFor(game.players, seconds);
    return { ok: await verifyLockstep(game.players, played), game };
  },

  // FR-032: a guest that leaves does not end the game for the others.
  async "guest-leaves"({ context, origin }) {
    const game = await startGame(context, origin, { guests: 2, hostArgs: [...HOST_ARGS, "-altdeath", "-nomonsters"] });
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    // g1 leaves; the host and g2 go on.
    const [host, leaving, staying] = game.players;
    await sleep(15_000);
    const before = await host.state();
    note(`  before: host tic ${before.tic}, players ${before.players.toString(2)}`);
    const left = Date.now();
    await leaving.leave();
    await leaving.page.close();
    const noticed = await until(async () => ((await host.state())?.players & 0b010) === 0, 20_000, 100);
    note(`  host dropped the player ${noticed ? `after ${Date.now() - left} ms` : "NOT"}`);
    await sleep(15_000);
    const after = await Promise.all([host.state(), staying.state()]);
    const exits = await Promise.all([host.result(), staying.result()]);
    note(`  after 15 s more: host tic ${after[0].tic} players ${after[0].players.toString(2)}, g2 tic ${after[1].tic} players ${after[1].players.toString(2)}`);
    note(`  exits: host ${JSON.stringify(exits[0].exit)} exited=${exits[0].exited}, g2 ${JSON.stringify(exits[1].exit)} exited=${exits[1].exited}`);
    const ok = noticed && after[0].tic > before.tic + 300 && after[1].tic > before.tic + 300 && !exits[0].exited && !exits[1].exited
      && (after[0].players & 0b101) === 0b101 && (after[0].players & 0b010) === 0 && after[1].players === after[0].players;
    return { ok, game };
  },

  // The same when the guest's channel dies without a clean close: no event, only silence. The
  // game continues for the others, who wait for the 30 s timeout of the engine.
  async "guest-leaves-silently"({ context, origin }) {
    const game = await startGame(context, origin);
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const [host, guest] = game.players;
    await sleep(10_000);
    const before = await host.state();
    const gone = Date.now();
    await guest.page.close();
    const noticed = await until(async () => ((await host.state())?.players & 0b10) === 0, 60_000, 500);
    const waited = Date.now() - gone;
    note(`  host dropped the silent guest ${noticed ? `after ${(waited / 1000).toFixed(1)} s` : "NOT within 60 s"}`);
    const after = await host.state();
    const exited = (await host.result()).exited;
    note(`  host tic ${before.tic} -> ${after.tic}, exited=${exited}`);
    return { ok: noticed && !exited && after.tic > before.tic, game };
  },

  // FR-032: the host leaving ends the game for the guests, with a notice.
  async "host-leaves"({ context, origin }) {
    const game = await startGame(context, origin, { guests: 2, hostArgs: [...HOST_ARGS, "-altdeath", "-nomonsters"] });
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const [host, ...guests] = game.players;
    await sleep(10_000);
    const left = Date.now();
    await host.leave();
    await host.page.close();
    const ended = await until(async () => (await Promise.all(guests.map((g) => g.hasExited()))).every(Boolean), 40_000, 100);
    note(`  guests ${ended ? `ended after ${Date.now() - left} ms` : "did NOT end"}`);
    const exits = await Promise.all(guests.map((g) => g.result()));
    exits.forEach((result, i) => note(`  ${guests[i].id}: exit ${JSON.stringify(result.exit)} status ${result.status} error ${result.error}`));
    const ok = ended && exits.every((r) => r.exit && r.exit.isError === false && /host/i.test(r.exit.message));
    return { ok, game };
  },

  // The host quits through the engine's menu: the engine says goodbye to the guests itself.
  async "host-quits"({ context, origin }) {
    const game = await startGame(context, origin);
    if (!game.reached) return { ok: false, game, why: "not all players reached the level" };
    const [host, guest] = game.players;
    await sleep(10_000);
    const quit = Date.now();
    await host.page.evaluate(() => window.__harness.quitFromMenu());
    const hostEnded = await until(() => host.hasExited(), 20_000, 100);
    note(`  host ${hostEnded ? `ended after ${Date.now() - quit} ms` : "did NOT end"}: exit ${JSON.stringify((await host.result()).exit)}`);
    // No close event from the shell here: the engine's own goodbye (disconnect packets) must be enough.
    const guestEnded = await until(() => guest.hasExited(), 40_000, 100);
    const exit = (await guest.result()).exit;
    note(`  guest ${guestEnded ? `ended after ${Date.now() - quit} ms` : "did NOT end"}: exit ${JSON.stringify(exit)}`);
    return { ok: hostEnded && guestEnded && exit?.isError === false && /host/i.test(exit.message), game };
  },

  // SC-002 groundwork: one engine, `-timedemo demo1` as fast as it goes. The engine reports game tics per
  // second of real time through the exit hook; 35 is real time. Chromium on a desktop is the baseline only:
  // the figure that counts is the one of a mid-range phone, from the speed check in the app.
  async timedemo({ context, origin }) {
    const page = await context.newPage();
    const query = new URLSearchParams({ id: "host", wad: "freedoom1", args: JSON.stringify(["-timedemo", "demo1"]), session: "0", bot: "0" });
    await page.goto(`${origin}/harness.html?${query}`);
    const ended = await until(() => page.evaluate(() => window.__harness.result.exited).catch(() => false), 180_000, 500);
    const result = await page.evaluate(() => ({ ...window.__harness.result }));
    note(`  exit ${JSON.stringify(result.exit)} status ${result.status} error ${result.error}`);
    if (!result.exit) note((await page.evaluate(() => window.__harness.log.slice(-15))).join("\n"));
    const report = /^timed (\d+) gametics in (\d+) realtics \(([\d.]+) fps\)$/.exec(result.exit?.message ?? "");
    if (report) note(`  ${report[3]} game tics per second (${report[1]} tics in ${report[2]} ticks)`);
    return { ok: ended && Boolean(report) && Number(report[3]) >= 35, game: { players: [] } };
  },

  // Jumping (Crispy's crispy_jump and key_jump, bound to Space): the height of the player must rise and come back. The
  // other cases are the controls: the settings before this change, and the engine's own key for jumping.
  async jump({ context, origin }) {
    const cases = [
      { name: "shipped config, Space", cfg: {}, key: "Space", jumps: true },
      { name: "before the change (crispy_jump 0, key_jump '/'), Space", cfg: { crispy_jump: 0, key_jump: 53 }, key: "Space", jumps: false },
      { name: "jumping on, key_jump still '/', Space", cfg: { key_jump: 53 }, key: "Space", jumps: false },
      { name: "jumping on, key_jump still '/', the '/' key", cfg: { key_jump: 53 }, key: "Slash", jumps: true },
      // What the shell sends for the pad's Y button: ev_joystick (3) with bit 6 (VIRTUAL_BUTTONS.jump) in data1.
      { name: "shipped config, joystick button 6 (the pad's Y)", cfg: {}, pad: 1 << 6, jumps: true },
      { name: "before the change (crispy_jump 0, joyb_jump -1), joystick button 6", cfg: { crispy_jump: 0, joyb_jump: -1 }, pad: 1 << 6, jumps: false },
    ];
    let ok = true;
    for (const { name, cfg, key, pad, jumps } of cases) {
      const game = await soloGame(context, origin, { cfg });
      if (!game.reached) return { ok: false, game, why: `${name}: the level did not start` };
      await sleep(500);
      const before = (await at(game.player)).z;
      const heights = await heightsDuring(game.player, async () => {
        if (pad) {
          await game.page.evaluate((buttons) => window.__harness.post(3, buttons), pad);
          await sleep(120);
          await game.page.evaluate(() => window.__harness.post(3, 0));
          return;
        }
        await game.page.keyboard.down(key);
        await sleep(120);
        await game.page.keyboard.up(key);
      }, 1800);
      const rise = heights.max - before;
      const back = Math.abs(heights.last - before) < 0.5;
      const pass = jumps ? rise > 20 && back : rise < 0.01 && back;
      note(`  ${name}: z ${before} -> peak ${heights.max} (+${rise.toFixed(1)}), at the end ${heights.last}, ${heights.samples} samples: ${pass ? "as expected" : "UNEXPECTED"} (${jumps ? "must jump" : "must not jump"})`);
      ok &&= pass;
      await game.page.close();
    }
    return { ok };
  },

  // A German keyboard: the confirmation of the quit prompt is the character y, which is the key labelled Y (at the position of
  // the US Z), not the key at the position of the US Y.
  async "quit-layout"({ context, origin }) {
    const game = await soloGame(context, origin);
    if (!game.reached) return { ok: false, game, why: "the level did not start" };
    await game.page.keyboard.press("F10");
    await sleep(700);
    await typeKey(game.cdp, "qwertz", "KeyY"); // the key labelled Z
    const early = await until(() => game.player.hasExited(), 3000, 100);
    note(`  key labelled Z (position of the US Y): engine ${early ? "EXITED" : "still running, prompt still open"}`);
    await typeKey(game.cdp, "qwertz", "KeyZ"); // the key labelled Y
    const ended = await until(() => game.player.hasExited(), 15_000, 100);
    const result = await game.player.result();
    note(`  key labelled Y (position of the US Z): engine ${ended ? "exited" : "did NOT exit"}, exit ${JSON.stringify(result?.exit)}`);
    return { ok: !early && ended && result?.exit?.isError === false, game };
  },

  // The US layout keeps working: y confirms the quit prompt.
  async "quit-us"({ context, origin }) {
    const game = await soloGame(context, origin);
    if (!game.reached) return { ok: false, game, why: "the level did not start" };
    await game.page.keyboard.press("F10");
    await sleep(700);
    await game.page.keyboard.press("n");
    await sleep(1000);
    const early = await game.player.hasExited();
    await game.page.keyboard.press("F10");
    await sleep(700);
    await game.page.keyboard.press("y");
    const ended = await until(() => game.player.hasExited(), 15_000, 100);
    note(`  US layout: n keeps the game running (exited: ${early}), y quits (exited: ${ended})`);
    return { ok: !early && ended, game };
  },

  // Typed text follows the layout: a save name with y and z (and a space) typed on a German keyboard.
  async "save-layout"({ context, origin }) {
    const game = await soloGame(context, origin);
    if (!game.reached) return { ok: false, game, why: "the level did not start" };
    await game.page.keyboard.press("F2");
    await sleep(500);
    await game.page.keyboard.press("Enter"); // the first slot
    await sleep(300);
    await typeText(game.cdp, "qwertz", "yz zy");
    await game.page.keyboard.press("Enter");
    const saved = await until(async () => (await game.player.read(() => window.__harness.written)).some((path) => /\.dsg$/.test(path)), 10_000, 100);
    const path = (await game.player.read(() => window.__harness.written))?.find((p) => /\.dsg$/.test(p));
    let description = null;
    if (path) {
      const bytes = await game.player.read((p) => window.__harness.readFile(p), path);
      description = String.fromCharCode(...bytes.slice(0, 24)).split("\0")[0];
    }
    note(`  typed "yz zy" after the default name MAP01 on QWERTZ; save file ${path}, description ${JSON.stringify(description)}`);
    return { ok: saved && description === "MAP01YZ ZY", game };
  },

  // Gameplay keys stay where they are: on an AZERTY keyboard the key labelled Z is at the position of the US W (forward) and the
  // key labelled Q at the position of the US A (strafe left).
  async "move-layout"({ context, origin }) {
    const game = await soloGame(context, origin);
    if (!game.reached) return { ok: false, game, why: "the level did not start" };
    await sleep(500);
    const angle = ((await game.player.read(() => window.__harness.playerField(2))) >>> 0) / 2 ** 32 * 2 * Math.PI;
    const forward = [Math.cos(angle), Math.sin(angle)];
    const left = [-Math.sin(angle), Math.cos(angle)];
    const along = (from, to, direction) => (to.x - from.x) * direction[0] + (to.y - from.y) * direction[1];
    let ok = true;
    for (const [label, code, direction, name] of [["z", "KeyW", forward, "forward"], ["q", "KeyA", left, "to the left"]]) {
      const from = await at(game.player);
      await typeKey(game.cdp, "azerty", code, { hold: 600 });
      await sleep(300);
      const to = await at(game.player);
      const moved = along(from, to, direction);
      note(`  AZERTY key labelled ${label.toUpperCase()} (position ${code}): moved ${moved.toFixed(1)} map units ${name}, (${from.x.toFixed(0)},${from.y.toFixed(0)}) -> (${to.x.toFixed(0)},${to.y.toFixed(0)})`);
      ok &&= moved > 20;
    }
    return { ok, game };
  },

  // A guest cannot start a netgame when the shell has no peer session (haex_net_active false).
  async "no-session"({ context, origin }) {
    const page = await context.newPage();
    const query = new URLSearchParams({ id: "g1", wad: "freedoom2", args: JSON.stringify(GUEST_ARGS), session: "0" });
    await page.goto(`${origin}/harness.html?${query}`);
    const ended = await until(() => page.evaluate(() => window.__harness.result.exited).catch(() => false), 30_000, 250);
    const result = await page.evaluate(() => ({ ...window.__harness.result }));
    note(`  exit ${JSON.stringify(result.exit)}`);
    return { ok: ended && result.exit?.isError === true, game: { players: [] } };
  },
};

async function main() {
  const argv = process.argv.slice(2);
  const secondsIndex = argv.indexOf("--seconds");
  const seconds = secondsIndex >= 0 ? Number(argv.splice(secondsIndex, 2)[1]) : 70;
  const names = argv.length > 0 ? argv : Object.keys(scenarios);
  for (const name of names) {
    if (!scenarios[name]) throw new Error(`unknown scenario ${name}`);
  }

  const playwright = await loadPlaywright();
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });

  const outcomes = {};
  for (const name of names) {
    note(`== ${name}`);
    const context = await browser.newContext();
    let outcome;
    try {
      outcome = await scenarios[name]({ context, origin, seconds });
    } catch (cause) {
      outcome = { ok: false, why: String(cause?.stack ?? cause) };
    }
    if (!outcome.ok) {
      note(`  ${outcome.why ?? ""}`);
      for (const player of outcome.game?.players ?? []) await dumpLog(player);
    }
    outcomes[name] = outcome.ok;
    note(`== ${name}: ${outcome.ok ? "PASS" : "FAIL"}`);
    await context.close();
  }
  await browser.close();
  server.close();
  console.log(`\n${Object.entries(outcomes).map(([name, ok]) => `${ok ? "PASS" : "FAIL"} ${name}`).join("\n")}`);
  process.exit(Object.values(outcomes).every(Boolean) ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
