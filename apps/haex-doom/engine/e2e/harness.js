// One engine instance of the end-to-end check of the lockstep over the bridge. Several pages of
// the same browser context stand in for the players' vaults: the datagrams the engine sends to
// a peer go through a BroadcastChannel to the page behind that peer, which hands them to its
// engine in `netRecv`. engine/e2e/run.mjs starts the pages and judges what they report.
//
// Query: id (host | g1 | g2 | ...), wad (file name without .wad), args (JSON array),
// latency (one-way delay in ms), loss (percent of datagrams dropped on send), bot (0 | 1),
// session (0: no peer session), tamper (N: flips a bit in the commands of every Nth datagram
// sent, which makes this instance's game diverge from the others: a control for the checks).
//
// Peer numbers, as the shell would assign them per device: the host knows guest gN as peer
// 10 + N, a guest knows the host as peer 1.

const query = new URLSearchParams(location.search);
const id = query.get("id") ?? "host";
const wadName = query.get("wad") ?? "freedoom2";
const args = JSON.parse(query.get("args") ?? "[]");
const latency = Number(query.get("latency") ?? 0);
const loss = Number(query.get("loss") ?? 0);
const bot = query.get("bot") !== "0";
// 0: the shell has no peer session (haex_net_active is false).
const tamper = Number(query.get("tamper") ?? 0);
const session = query.get("session") !== "0";

const HOST_PEER = 1;
const peerOf = (name) => (name === "host" ? HOST_PEER : 10 + Number(name.slice(1)));
const nameOf = (peer) => (peer === HOST_PEER ? "host" : `g${peer - 10}`);

const channel = new BroadcastChannel("haex-doom-loopback");
/** Datagrams that arrived: { at: earliest delivery time, from: peer number, data }. */
const inbox = [];
const stats = { sent: 0, received: 0, dropped: 0, oversize: 0, maxSize: 0 };
const log = [];
const history = [];
const result = { exit: null, exited: false, started: false, status: null, error: null };
let module = null;
let peerClosed = () => {};
let game = null;
let postEvent = null;

channel.onmessage = ({ data: message }) => {
  if (message.to !== id) return;
  if (message.type === "bye") {
    // The shell sees the channel close: the engine treats the peer like a node that timed out.
    setTimeout(() => peerClosed(peerOf(message.from)), latency);
    return;
  }
  inbox.push({ at: performance.now() + latency, from: peerOf(message.from), data: message.data });
};

const imports = {
  netActive: () => session,
  netSend: (peer, data) => {
    stats.sent++;
    stats.maxSize = Math.max(stats.maxSize, data.length);
    if (data.length > 1024) stats.oversize++;
    if (Math.random() * 100 < loss) {
      stats.dropped++;
      return;
    }
    if (tamper > 0 && stats.sent > 400 && stats.sent % tamper === 0 && data.length > 12) {
      data = data.slice();
      data[data.length - 2] ^= 1;
    }
    channel.postMessage({ to: nameOf(peer), from: id, data });
  },
  netRecv: (target) => {
    const now = performance.now();
    const index = inbox.findIndex((entry) => entry.at <= now);
    if (index < 0) return 0;
    const [{ from, data }] = inbox.splice(index, 1);
    if (data.length + 4 > target.length) return 0;
    new DataView(target.buffer, target.byteOffset, 4).setUint32(0, from, true);
    target.set(data, 4);
    stats.received++;
    return data.length + 4;
  },
  netResolve: (name) => (name === "host" && id !== "host" ? HOST_PEER : -1),
  engineExit: (isError, message) => {
    result.exit = { isError, message };
  },
  haptic: () => {},
  fileWritten: () => {},
  fileRemoved: () => {},
};

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function gunzip(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Engine keys (doomkeys.h) and event types (d_event.h).
const KEY_UPARROW = 0xad;
const KEY_F10 = 0x80 + 0x44;
const EV_KEYDOWN = 0;
const EV_KEYUP = 1;
const EV_MOUSE = 2;

function startBot() {
  // Walks forward, turns back and forth, and fires in bursts, so that the game state keeps
  // changing and a divergence between the instances would show. The phase depends on the id.
  const phase = peerOf(id) * 0.7;
  postEvent(EV_KEYDOWN, KEY_UPARROW, 0, 0, 0, 0, 0);
  let step = 0;
  setInterval(() => {
    step++;
    const turn = Math.round(Math.sin(step / 7 + phase) * 24);
    const fire = Math.floor(step / 10 + phase) % 3 === 0 ? 1 : 0;
    postEvent(EV_MOUSE, fire, turn, 0, 0, 0, 0);
  }, 50);
}

function startSampler(player) {
  // The state after every game tic the page sees, to compare the instances at equal tics.
  let last = -1;
  setInterval(() => {
    const tic = game(0);
    if (tic === last) return;
    last = tic;
    history.push([
      tic, game(1), game(2), game(5),
      player(0, 0), player(0, 1), player(0, 2), player(0, 3),
      player(1, 0), player(1, 1), player(1, 2), player(1, 3),
    ]);
  }, 4);
}

async function main() {
  const canvas = document.getElementById("canvas");
  const [wad, defaultCfg, crispyCfg] = await Promise.all([
    gunzip(`/wads/${wadName}.wad.gz`),
    fetchBytes("/engine/config/default.cfg"),
    fetchBytes("/engine/config/crispy-doom.cfg"),
  ]);
  const { default: factory } = await import("/engine/crispy-doom.js");
  module = await factory({
    canvas,
    haexImports: imports,
    SDL2: { audioContext: new AudioContext() },
    print: (text) => log.push(text),
    printErr: (text) => log.push(text),
    onExit: (status) => {
      result.exited = true;
      result.status = status;
    },
    onAbort: (reason) => {
      result.exited = true;
      result.error = `abort: ${reason}`;
    },
  });
  const wrap = (name, count) => module.cwrap(name, "number", Array(count).fill("number"));
  postEvent = wrap("haex_post_event", 7);
  const closeFn = wrap("haex_net_peer_closed", 1);
  peerClosed = (peer) => closeFn(peer);
  game = wrap("haex_debug_game", 1);

  module.FS.mkdirTree("/wads");
  module.FS.mkdirTree("/config");
  module.FS.mkdirTree("/saves/test");
  module.FS.writeFile(`/wads/${wadName}.wad`, wad);
  module.FS.writeFile("/config/default.cfg", defaultCfg);
  module.FS.writeFile("/config/crispy-doom.cfg", crispyCfg);

  startSampler(wrap("haex_debug_player", 2));
  result.started = true;
  try {
    module.callMain([
      "-iwad", `/wads/${wadName}.wad`,
      "-config", "/config/default.cfg",
      "-extraconfig", "/config/crispy-doom.cfg",
      "-savedir", "/saves/test/",
      ...args,
    ]);
  } catch (cause) {
    result.error = String(cause);
  }
  // The bot only has an effect once the level runs; its events before that are ignored.
  if (bot) startBot();
}

// What the runner reads and calls.
window.__harness = {
  id,
  result,
  stats,
  log,
  history,
  state: () => ({
    tic: game?.(0) ?? -1,
    leveltime: game?.(1) ?? -1,
    players: game?.(2) ?? -1,
    consoleplayer: game?.(3) ?? -1,
    netgame: game?.(4) ?? -1,
  }),
  // The vault side of leaving: the other pages see this channel close.
  leave: () => {
    for (const other of ["host", "g1", "g2", "g3"]) {
      if (other !== id) channel.postMessage({ type: "bye", to: other, from: id });
    }
  },
  // The player quits through the engine's menu (F10, then y).
  quitFromMenu: () => {
    postEvent(EV_KEYDOWN, KEY_F10, 0, 0, 0, 0, 0);
    postEvent(EV_KEYUP, KEY_F10, 0, 0, 0, 0, 0);
    setTimeout(() => {
      postEvent(EV_KEYDOWN, 0x79, 0, 0, 0, 0, 0);
      postEvent(EV_KEYUP, 0x79, 0, 0, 0, 0, 0);
    }, 500);
  },
};

main().catch((cause) => {
  result.error = String(cause?.stack ?? cause);
});
