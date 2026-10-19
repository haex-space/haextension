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
  camera.fadeOut(duration, 0, 0, 0)
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    beforeStart?.()
    scene.scene.start(key, data)
  })
}
