import Phaser from 'phaser'

type FadeStartListener = (
  camera: Phaser.Cameras.Scene2D.Camera,
  effect: Phaser.Cameras.Scene2D.Effects.Fade,
  duration: number,
  red: number,
  green: number,
  blue: number,
) => void

/**
 * A zoomed camera also zooms scrollFactor(0) objects around its centre, which pushes
 * fixed-position UI off-screen. The HUD therefore gets its own unzoomed camera that skips
 * every other object (including ones added later) and fades together with the main camera.
 */
export function createHudCamera(scene: Phaser.Scene, hud: Phaser.GameObjects.GameObject[]): void {
  const main = scene.cameras.main
  const hudCamera = scene.cameras.add()

  main.ignore(hud)
  hudCamera.ignore(scene.children.list.filter(child => !hud.includes(child)))

  const ignoreWorldObject = (gameObject: Phaser.GameObjects.GameObject) => {
    hudCamera.ignore(gameObject)
  }
  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, ignoreWorldObject)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, ignoreWorldObject)
  })

  const mirrorFadeOut: FadeStartListener = (_camera, _effect, duration, red, green, blue) => {
    hudCamera.fade(duration, red, green, blue, true)
  }
  const mirrorFadeIn: FadeStartListener = (_camera, _effect, duration, red, green, blue) => {
    hudCamera.fadeIn(duration, red, green, blue)
  }
  main.on(Phaser.Cameras.Scene2D.Events.FADE_OUT_START, mirrorFadeOut)
  main.on(Phaser.Cameras.Scene2D.Events.FADE_IN_START, mirrorFadeIn)
}
