export type GameFamily = "doom1" | "doom2";

export interface BundledGame {
  id: string;
  title: string;
  /** Name in the engine's file system; the engine recognises the game by it. */
  fileName: string;
  family: GameFamily;
  /** Gzip-compressed WAD, relative to the app's base URL. */
  asset: string;
  /** SHA-256 of the uncompressed WAD, as printed by engine/fetch-data.sh. */
  fingerprint: string;
}

export const BUNDLED_GAMES: readonly BundledGame[] = [
  {
    id: "freedoom1",
    title: "Freedoom: Phase 1",
    fileName: "freedoom1.wad",
    family: "doom1",
    asset: "wads/freedoom1.wad.gz",
    fingerprint: "7323bcc168c5a45ff10749b339960e98314740a734c30d4b9f3337001f9e703d",
  },
  {
    id: "freedoom2",
    title: "Freedoom: Phase 2",
    fileName: "freedoom2.wad",
    family: "doom2",
    asset: "wads/freedoom2.wad.gz",
    fingerprint: "a8772e088847032510d97ba2312406a6998f21cbab44d4ff10696faa9c0ecd4b",
  },
  {
    id: "doom1",
    title: "DOOM (shareware)",
    fileName: "doom1.wad",
    family: "doom1",
    asset: "wads/doom1.wad.gz",
    fingerprint: "1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771",
  },
];
