/** What the engine reports after a `-timedemo` run (`G_CheckDemoStatus`, through `I_Error`). */
export interface TimedemoResult {
  gametics: number;
  realtics: number;
  /** Game tics per second of real time; 35 is real time (FR SC-002). */
  ticsPerSecond: number;
}

const TIMEDEMO_MESSAGE = /^timed (\d+) gametics in (\d+) realtics \(([\d.]+) fps\)$/;

export function parseTimedemo(message: string): TimedemoResult | null {
  const match = TIMEDEMO_MESSAGE.exec(message.trim());
  if (!match) return null;
  const [gametics, realtics, ticsPerSecond] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return Number.isFinite(ticsPerSecond) ? { gametics, realtics, ticsPerSecond } : null;
}
