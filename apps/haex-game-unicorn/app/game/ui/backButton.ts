import type Phaser from 'phaser'
import { fadeToScene } from '../scenes/transition'

/** Round top-right button with a left arrow that leads back to the overworld. */
export function createBackButton(scene: Phaser.Scene, depth: number): Phaser.GameObjects.GameObject[] {
  const x = scene.scale.width - 16
  const y = 16

  const btn = scene.add.graphics()
  btn.setScrollFactor(0)
  btn.setDepth(depth)

  btn.fillStyle(0x000000, 0.3)
  btn.fillCircle(x, y, 10)
  btn.lineStyle(2, 0xffffff, 0.7)
  btn.lineBetween(x - 4, y, x + 3, y)
  btn.lineBetween(x - 4, y, x - 1, y - 3)
  btn.lineBetween(x - 4, y, x - 1, y + 3)

  const hitZone = scene.add.zone(x, y, 24, 24)
  hitZone.setScrollFactor(0)
  hitZone.setDepth(depth)
  hitZone.setInteractive({ useHandCursor: true })
  hitZone.on('pointerdown', () => {
    scene.input.removeAllListeners()
    fadeToScene(scene, 'OverworldScene')
  })

  return [btn, hitZone]
}
