import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    this.createLoadingBar()
    this.loadPlaceholderAssets()
  }

  create() {
    this.scene.start('OverworldScene')
  }

  private createLoadingBar() {
    const centerX = GAME_WIDTH / 2
    const centerY = GAME_HEIGHT / 2

    const barWidth = 200
    const barHeight = 16

    // Background bar
    const bgBar = this.add.rectangle(centerX, centerY, barWidth, barHeight, 0x3a5a40)
    bgBar.setStrokeStyle(2, 0x2d4a30)

    // Progress bar
    const progressBar = this.add.rectangle(
      centerX - barWidth / 2 + 2,
      centerY,
      0,
      barHeight - 4,
      0x8fbc8f,
    )
    progressBar.setOrigin(0, 0.5)

    this.load.on('progress', (value: number) => {
      progressBar.width = (barWidth - 4) * value
    })
  }

  private loadPlaceholderAssets() {
    // Generate placeholder sprites programmatically for now
    // These will be replaced with real pixel art assets later

    // Unicorn placeholder (32x32 pink rectangle)
    const unicornGfx = this.make.graphics({ x: 0, y: 0 })
    unicornGfx.fillStyle(0xf0a0d0)
    unicornGfx.fillRect(0, 0, 32, 32)
    // Horn
    unicornGfx.fillStyle(0xffd700)
    unicornGfx.fillTriangle(16, 0, 12, 10, 20, 10)
    unicornGfx.generateTexture('unicorn', 32, 32)
    unicornGfx.destroy()

    // Grass tile placeholder (16x16)
    const grassGfx = this.make.graphics({ x: 0, y: 0 })
    grassGfx.fillStyle(0x5a8f3d)
    grassGfx.fillRect(0, 0, 16, 16)
    grassGfx.fillStyle(0x4a7f2d)
    grassGfx.fillRect(2, 8, 3, 8)
    grassGfx.fillRect(8, 6, 3, 10)
    grassGfx.fillRect(13, 9, 2, 7)
    grassGfx.generateTexture('grass', 16, 16)
    grassGfx.destroy()

    // Flower placeholder (16x16)
    const flowerGfx = this.make.graphics({ x: 0, y: 0 })
    flowerGfx.fillStyle(0x5a8f3d)
    flowerGfx.fillRect(7, 8, 2, 8)
    flowerGfx.fillStyle(0xff6b9d)
    flowerGfx.fillCircle(8, 5, 4)
    flowerGfx.fillStyle(0xffdd44)
    flowerGfx.fillCircle(8, 5, 2)
    flowerGfx.generateTexture('flower', 16, 16)
    flowerGfx.destroy()

    // Tree placeholder (32x48)
    const treeGfx = this.make.graphics({ x: 0, y: 0 })
    treeGfx.fillStyle(0x6b4423)
    treeGfx.fillRect(12, 24, 8, 24)
    treeGfx.fillStyle(0x2d5a1e)
    treeGfx.fillCircle(16, 16, 14)
    treeGfx.fillStyle(0x3a7a28)
    treeGfx.fillCircle(12, 12, 8)
    treeGfx.generateTexture('tree', 32, 48)
    treeGfx.destroy()

    // Bumblebee nest placeholder (24x20)
    const nestGfx = this.make.graphics({ x: 0, y: 0 })
    nestGfx.fillStyle(0x5a4a2a)
    nestGfx.fillEllipse(12, 14, 24, 16)
    nestGfx.fillStyle(0x3a3a1a)
    nestGfx.fillCircle(12, 16, 4)
    nestGfx.generateTexture('bumblebee-nest', 24, 20)
    nestGfx.destroy()
  }
}
