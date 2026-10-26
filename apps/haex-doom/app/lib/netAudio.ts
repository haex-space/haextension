import { unlockAudio } from "~/lib/audioUnlock";

/**
 * The audio context of the next netgame. Guests learn that the game starts from a message, not
 * from a tap, so the context is created in the last tap before (opening, joining or starting a
 * lobby; research R-14) and handed to the engine when the game starts.
 * ponytail: an invitation is accepted in the vault's prompt, not in this frame, so that guest
 * gets a context created without a gesture; it resumes with the first input (GameView).
 */
let prepared: AudioContext | null = null;

/** Call inside a tap. */
export function prepareNetAudio(): void {
  prepared ??= unlockAudio();
}

export function takeNetAudio(): AudioContext {
  const context = prepared ?? unlockAudio();
  prepared = null;
  return context;
}
