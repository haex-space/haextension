import type Phaser from 'phaser'

export function ensureQueenInteriorTexture(scene: Phaser.Scene) {
  if (!scene.textures.exists('bee-queen-interior')) {
    const gfx = scene.make.graphics({ x: 0, y: 0 })
    // Larger, more detailed bumblebee queen for interior view
    // Black body base
    gfx.fillStyle(0x1a1a1a)
    gfx.fillEllipse(20, 18, 30, 20)
    // Yellow band front
    gfx.fillStyle(0xf0c830)
    gfx.fillRect(10, 12, 14, 5)
    // Yellow band rear
    gfx.fillStyle(0xf0c830)
    gfx.fillRect(16, 22, 12, 4)
    // Orange tail
    gfx.fillStyle(0xe06030)
    gfx.fillEllipse(32, 20, 10, 12)
    // Head — black
    gfx.fillStyle(0x1a1a1a)
    gfx.fillCircle(5, 14, 7)
    // Eyes
    gfx.fillStyle(0x222222)
    gfx.fillCircle(3, 12, 2)
    // Wings folded
    gfx.fillStyle(0xccccee, 0.3)
    gfx.fillEllipse(18, 8, 16, 8)
    gfx.generateTexture('bee-queen-interior', 40, 30)
    gfx.destroy()
  }
}

export function ensureWaxPieceTexture(scene: Phaser.Scene) {
  if (!scene.textures.exists('wax-piece')) {
    const gfx = scene.make.graphics({ x: 0, y: 0 })
    gfx.fillStyle(0xe8d060)
    gfx.fillEllipse(6, 6, 10, 8)
    gfx.fillStyle(0xd4bc40, 0.5)
    gfx.fillEllipse(5, 5, 6, 4)
    gfx.generateTexture('wax-piece', 12, 12)
    gfx.destroy()
  }
}

export function ensurePollenBallTexture(scene: Phaser.Scene) {
  if (!scene.textures.exists('pollen-ball')) {
    const gfx = scene.make.graphics({ x: 0, y: 0 })
    gfx.fillStyle(0xffaa22)
    gfx.fillCircle(5, 5, 5)
    gfx.fillStyle(0xffcc44, 0.5)
    gfx.fillCircle(4, 4, 2)
    gfx.generateTexture('pollen-ball', 10, 10)
    gfx.destroy()
  }
}
