export interface Stopwatch {
  /** Starts counting; only the first call does anything. */
  start(): void
  pause(): void
  resume(): void
  /** Milliseconds counted so far, excluding paused spans. */
  elapsed(): number
  /** Stops for good: the time stays as it is, `resume` does nothing. */
  freeze(): void
  readonly started: boolean
}

/** Counts the time spent solving; the clock is injected so the pause arithmetic can be tested. */
export function createStopwatch(now: () => number = () => performance.now()): Stopwatch {
  let started = false
  let frozen = false
  let running = false
  let since = 0
  let counted = 0

  const settle = () => {
    if (running) counted += now() - since
    running = false
  }

  return {
    get started() { return started },

    start() {
      if (started) return
      started = true
      running = true
      since = now()
    },

    pause() {
      if (!started || frozen) return
      settle()
    },

    resume() {
      if (!started || frozen || running) return
      running = true
      since = now()
    },

    freeze() {
      settle()
      frozen = true
    },

    elapsed() {
      return running ? counted + (now() - since) : counted
    },
  }
}
