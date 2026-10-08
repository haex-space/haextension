import type Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../../config'
import { lerpColor } from '../../utils/color'
import { DEPTH } from './constants'
import type { Phase } from './constants'

export class NestInteriorHud {
  private scene: Phaser.Scene
  private phaseIndicator: Phaser.GameObjects.Graphics
  private temperatureBar: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    this.createBackButton()

    this.phaseIndicator = scene.add.graphics()
    this.phaseIndicator.setDepth(DEPTH.UI)
    this.phaseIndicator.setScrollFactor(0)

    this.temperatureBar = scene.add.graphics()
    this.temperatureBar.setDepth(DEPTH.UI)
    this.temperatureBar.setScrollFactor(0)
  }

  private createBackButton() {
    const btn = this.scene.add.graphics()
    btn.setScrollFactor(0)
    btn.setDepth(DEPTH.UI)

    btn.fillStyle(0x000000, 0.3)
    btn.fillCircle(GAME_WIDTH - 16, 16, 10)
    btn.lineStyle(2, 0xffffff, 0.7)
    btn.lineBetween(GAME_WIDTH - 20, 16, GAME_WIDTH - 13, 16)
    btn.lineBetween(GAME_WIDTH - 20, 16, GAME_WIDTH - 17, 13)
    btn.lineBetween(GAME_WIDTH - 20, 16, GAME_WIDTH - 17, 19)

    const hitZone = this.scene.add.zone(GAME_WIDTH - 16, 16, 24, 24)
    hitZone.setScrollFactor(0)
    hitZone.setDepth(DEPTH.UI)
    hitZone.setInteractive({ useHandCursor: true })
    hitZone.on('pointerdown', () => this.returnToOverworld())
  }

  private returnToOverworld() {
    this.scene.input.removeAllListeners()
    this.scene.cameras.main.fadeOut(600, 0, 0, 0)
    this.scene.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.scene.start('OverworldScene')
    })
  }

  update(phase: Phase, isBrooding: boolean, broodTemperature: number, broodTimer: number, broodDuration: number) {
    this.phaseIndicator.clear()

    // Phase progress dots (top center)
    const phases: Phase[] = ['build-cells', 'fill-pollen', 'lay-eggs', 'brood']
    const currentIdx = phases.indexOf(phase)

    for (let i = 0; i < phases.length; i++) {
      const x = GAME_WIDTH / 2 - 30 + i * 20
      const y = 12
      const isActive = i === currentIdx
      const isDone = i < currentIdx

      this.phaseIndicator.fillStyle(
        isDone ? 0x88cc88 : isActive ? 0xffdd44 : 0x666666,
        isDone ? 0.8 : isActive ? 0.9 : 0.4,
      )
      this.phaseIndicator.fillCircle(x, y, isActive ? 5 : 3)
    }

    // Temperature bar during brood phase
    this.temperatureBar.clear()
    if (phase === 'brood' && isBrooding) {
      const barX = GAME_WIDTH - 20
      const barY = 40
      const barH = 80

      // Background
      this.temperatureBar.fillStyle(0x333333, 0.5)
      this.temperatureBar.fillRoundedRect(barX, barY, 6, barH, 3)

      // Fill
      const fillH = barH * broodTemperature
      const color = lerpColor(0x4488ff, 0xff6622, broodTemperature)
      this.temperatureBar.fillStyle(color, 0.8)
      this.temperatureBar.fillRoundedRect(barX, barY + barH - fillH, 6, fillH, 3)

      // Progress bar at bottom
      const progW = GAME_WIDTH - 100
      const progX = 50
      const progY = GAME_HEIGHT - 20
      this.temperatureBar.fillStyle(0x333333, 0.4)
      this.temperatureBar.fillRoundedRect(progX, progY, progW, 4, 2)
      this.temperatureBar.fillStyle(0xffdd44, 0.7)
      this.temperatureBar.fillRoundedRect(progX, progY, progW * (broodTimer / broodDuration), 4, 2)
    }
  }
}
