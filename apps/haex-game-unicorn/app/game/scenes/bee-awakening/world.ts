import type Phaser from 'phaser'
import { DEPTH, SCENE_HEIGHT, SCENE_WIDTH, TILE_SIZE } from './constants'
import type { EarlyFlower } from './constants'

export function createGround(scene: Phaser.Scene, rng: Phaser.Math.RandomDataGenerator) {
  // Early spring ground — frosty, sparse
  const frostGrassGfx = scene.make.graphics({ x: 0, y: 0 })
  frostGrassGfx.fillStyle(0x6a8a5a)
  frostGrassGfx.fillRect(0, 0, 16, 16)
  frostGrassGfx.fillStyle(0x8aaa7a, 0.3)
  frostGrassGfx.fillRect(4, 4, 2, 2) // frost spots
  frostGrassGfx.fillRect(10, 8, 3, 2)
  frostGrassGfx.generateTexture('frost-grass', 16, 16)
  frostGrassGfx.destroy()

  for (let x = 0; x < SCENE_WIDTH; x++) {
    for (let y = 0; y < SCENE_HEIGHT; y++) {
      const tile = scene.add.sprite(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 'frost-grass')
      tile.setDepth(DEPTH.GROUND)
      if (rng.frac() > 0.8) {
        tile.setTint(0x7a9a6a)
      }
    }
  }

  scene.physics.world.setBounds(0, 0, SCENE_WIDTH * TILE_SIZE, SCENE_HEIGHT * TILE_SIZE)
}

export function createEmergencePoint(scene: Phaser.Scene) {
  // Mound of earth where queen emerges
  const moundGfx = scene.make.graphics({ x: 0, y: 0 })
  moundGfx.fillStyle(0x6a5a3a)
  moundGfx.fillEllipse(16, 12, 28, 16)
  moundGfx.fillStyle(0x5a4a2a)
  moundGfx.fillEllipse(16, 10, 22, 12)
  // Small hole
  moundGfx.fillStyle(0x2a1a0a)
  moundGfx.fillCircle(16, 12, 5)
  moundGfx.generateTexture('emergence-mound', 32, 20)
  moundGfx.destroy()

  const cx = (SCENE_WIDTH * TILE_SIZE) / 2
  const cy = (SCENE_HEIGHT * TILE_SIZE) / 2 + 40
  scene.add.sprite(cx, cy, 'emergence-mound').setDepth(DEPTH.GROUND_DETAIL)
}

export function createEarlySpringFlowers(scene: Phaser.Scene, rng: Phaser.Math.RandomDataGenerator) {
  // Crocus texture
  const crocusGfx = scene.make.graphics({ x: 0, y: 0 })
  crocusGfx.fillStyle(0x3a6a28)
  crocusGfx.fillRect(7, 10, 2, 6)
  crocusGfx.fillStyle(0xbb77ff)
  crocusGfx.fillEllipse(8, 7, 6, 8)
  crocusGfx.fillStyle(0xffcc44)
  crocusGfx.fillCircle(8, 7, 1.5)
  crocusGfx.generateTexture('crocus', 16, 16)
  crocusGfx.destroy()

  // Snowdrop texture
  const snowdropGfx = scene.make.graphics({ x: 0, y: 0 })
  snowdropGfx.fillStyle(0x3a6a28)
  snowdropGfx.fillRect(7, 6, 1, 10)
  snowdropGfx.lineStyle(1, 0x3a6a28)
  snowdropGfx.lineBetween(7, 6, 5, 8)
  snowdropGfx.fillStyle(0xffffff)
  snowdropGfx.fillEllipse(4, 10, 4, 6)
  snowdropGfx.generateTexture('snowdrop', 12, 16)
  snowdropGfx.destroy()

  // Willow catkin texture
  const willowGfx = scene.make.graphics({ x: 0, y: 0 })
  willowGfx.fillStyle(0x6a5a3a)
  willowGfx.fillRect(7, 0, 2, 16)
  willowGfx.fillStyle(0xdddd88)
  willowGfx.fillEllipse(8, 4, 5, 6)
  willowGfx.fillEllipse(8, 10, 4, 5)
  willowGfx.generateTexture('willow-catkin', 16, 16)
  willowGfx.destroy()

  const flowerDefs: { type: EarlyFlower['type'], texture: string }[] = [
    { type: 'crocus', texture: 'crocus' },
    { type: 'crocus', texture: 'crocus' },
    { type: 'snowdrop', texture: 'snowdrop' },
    { type: 'snowdrop', texture: 'snowdrop' },
    { type: 'willow-catkin', texture: 'willow-catkin' },
  ]

  const earlyFlowers: EarlyFlower[] = []

  // Scatter sparsely — early spring, not many flowers yet
  for (const def of flowerDefs) {
    const x = rng.between(TILE_SIZE * 3, SCENE_WIDTH * TILE_SIZE - TILE_SIZE * 3)
    const y = rng.between(TILE_SIZE * 3, SCENE_HEIGHT * TILE_SIZE - TILE_SIZE * 3)

    const sprite = scene.add.sprite(x, y, def.texture)
    sprite.setDepth(DEPTH.FLOWERS)

    // Interaction zone
    const zone = scene.add.zone(x, y, 24, 24)
    scene.physics.add.existing(zone, true)

    earlyFlowers.push({
      sprite,
      type: def.type,
      x,
      y,
      hasNectar: true,
      interactionZone: zone,
    })
  }

  return earlyFlowers
}
