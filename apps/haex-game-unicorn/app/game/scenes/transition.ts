import Phaser from 'phaser'

interface FadeToSceneOptions {
  data?: object
  duration?: number
  /** Runs after the fade, right before the next scene starts. */
  beforeStart?: () => void
}

export function fadeToScene(
  scene: Phaser.Scene,
  key: string,
  { data, duration = 600, beforeStart }: FadeToSceneOptions = {},
): void {
  const camera = scene.cameras.main
  const fade = camera.fadeEffect
  // Every extra call would queue another start of the next scene, so only the first one counts
  if (fade.direction && (fade.isRunning || fade.isComplete)) return

  // force: a fade-in that is still running must not swallow the transition
  camera.fade(duration, 0, 0, 0, true)
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    beforeStart?.()
    scene.scene.start(key, data)
  })
}
