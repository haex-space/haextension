import type Phaser from 'phaser'
import { DEPTH, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants'
import type { WorldFlower, WorldTree } from './constants'

export function createGround(scene: Phaser.Scene, rng: Phaser.Math.RandomDataGenerator) {
  for (let x = 0; x < MAP_WIDTH; x++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const grass = scene.add.sprite(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 'grass')
      grass.setDepth(DEPTH.GROUND)

      // Natural color variation
      const variation = rng.frac()
      if (variation > 0.85) {
        grass.setTint(0x4a8f3d) // darker
      }
      else if (variation > 0.7) {
        grass.setTint(0x6a9f4d) // lighter
      }
    }
  }

  scene.physics.world.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
}

export function createGrassDetails(scene: Phaser.Scene, rng: Phaser.Math.RandomDataGenerator) {
  const grassDetails: Phaser.GameObjects.Sprite[] = []
  for (let i = 0; i < 80; i++) {
    const x = rng.between(TILE_SIZE, MAP_WIDTH * TILE_SIZE - TILE_SIZE)
    const y = rng.between(TILE_SIZE, MAP_HEIGHT * TILE_SIZE - TILE_SIZE)
    const detail = scene.add.sprite(x, y, 'tall-grass')
    detail.setDepth(DEPTH.GROUND_DETAIL)
    detail.setAlpha(0.7 + rng.frac() * 0.3)
    grassDetails.push(detail)
  }
  return grassDetails
}

export function createTrees(scene: Phaser.Scene, rng: Phaser.Math.RandomDataGenerator) {
  const trees: WorldTree[] = []
  for (let i = 0; i < 18; i++) {
    const x = rng.between(TILE_SIZE * 4, MAP_WIDTH * TILE_SIZE - TILE_SIZE * 4)
    const y = rng.between(TILE_SIZE * 4, MAP_HEIGHT * TILE_SIZE - TILE_SIZE * 4)

    const trunk = scene.add.sprite(x, y, 'tree-trunk')
    trunk.setDepth(DEPTH.TREE_TRUNK)
    trunk.setOrigin(0.5, 0.9)

    const foliage = scene.add.sprite(x, y - 26, 'tree-foliage')
    foliage.setDepth(DEPTH.TREE_FOLIAGE + y) // sort by Y for overlap
    foliage.setOrigin(0.5, 0.7)

    trees.push({
      trunk,
      foliage,
      x,
      y,
      swayOffset: rng.frac() * Math.PI * 2,
    })
  }
  return trees
}

export function createFlowers(scene: Phaser.Scene, rng: Phaser.Math.RandomDataGenerator) {
  const flowerTypes = [
    { key: 'flower-pink' },
    { key: 'flower-blue' },
    { key: 'flower-yellow' },
    { key: 'flower-white' },
    { key: 'flower-purple' },
  ]

  const flowers: WorldFlower[] = []
  for (let i = 0; i < 50; i++) {
    const x = rng.between(TILE_SIZE * 2, MAP_WIDTH * TILE_SIZE - TILE_SIZE * 2)
    const y = rng.between(TILE_SIZE * 2, MAP_HEIGHT * TILE_SIZE - TILE_SIZE * 2)
    const type = flowerTypes[rng.between(0, flowerTypes.length - 1)]
    if (!type) continue

    const flower = scene.add.sprite(x, y, type.key)
    flower.setDepth(DEPTH.FLOWERS)

    flowers.push({
      sprite: flower,
      x,
      y,
      swayOffset: rng.frac() * Math.PI * 2,
      type: type.key,
    })
  }
  return flowers
}
