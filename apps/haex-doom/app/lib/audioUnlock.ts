interface AudioSessionNavigator {
  audioSession?: { type: string };
}

/**
 * Creates the AudioContext the engine plays through, inside the user's start gesture
 * (research R-14). WKWebView only lets a context start from a gesture, and SDL2's Emscripten
 * audio reuses `Module.SDL2.audioContext` when it is already set.
 */
export function unlockAudio(): AudioContext {
  const session = (navigator as Navigator & AudioSessionNavigator).audioSession;
  if (session) session.type = "playback";

  const context = new AudioContext();
  // iOS also wants a sound started from the gesture before the context really plays.
  const silence = context.createBufferSource();
  silence.buffer = context.createBuffer(1, 1, context.sampleRate);
  silence.connect(context.destination);
  silence.start();
  void context.resume();
  return context;
}

/** Resumes a context the platform suspended (e.g. after the app was in the background). */
export function resumeIfSuspended(context: AudioContext | undefined) {
  if (context?.state === "suspended") void context.resume();
}
