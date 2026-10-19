export interface WatchTarget {
  id: string;
  /** Changes whenever the account's connection settings or credentials may have. */
  key: string;
}

/**
 * Which background watches to stop and (re)start so the running ones match
 * `targets`. A watch whose key changed is started again — starting replaces
 * a running watch, so it picks up the new settings.
 */
export const planWatchChanges = (
  running: ReadonlyMap<string, string>,
  targets: WatchTarget[],
): { stop: string[]; start: WatchTarget[] } => {
  const targetIds = new Set(targets.map((t) => t.id));
  return {
    stop: [...running.keys()].filter((id) => !targetIds.has(id)),
    start: targets.filter((t) => running.get(t.id) !== t.key),
  };
};
