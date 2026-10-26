import type { GameFamily } from "~/lib/bundledGames";

const SHAREWARE_TITLE = "DOOM (shareware)";

/** Episodes the game of this family and title contains (the shareware game only has the first). */
function episodes(title: string): number {
  if (title === SHAREWARE_TITLE) return 1;
  if (title === "DOOM") return 3;
  return 4;
}

/**
 * The maps a host may start a netgame on, in the engine's naming: `E1M1`…`E<n>M9` for DOOM 1
 * games, `MAP01`…`MAP32` for DOOM II games.
 */
export function mapsFor(game: { family: GameFamily; title: string }): string[] {
  if (game.family === "doom2") {
    return Array.from({ length: 32 }, (_, index) => `MAP${String(index + 1).padStart(2, "0")}`);
  }
  const maps: string[] = [];
  for (let episode = 1; episode <= episodes(game.title); episode++) {
    for (let map = 1; map <= 9; map++) maps.push(`E${episode}M${map}`);
  }
  return maps;
}
