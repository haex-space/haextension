import type Phaser from 'phaser'

export const TILE_SIZE = 16
export const MAP_WIDTH = 60
export const MAP_HEIGHT = 40
export const UNICORN_SPEED = 80

// Depth layers
export const DEPTH = {
  SKY: 0,
  MOUNTAINS: 1,
  FAR_TREES: 2,
  GROUND: 3,
  GROUND_DETAIL: 4,
  FLOWERS: 5,
  NEST: 6,
  ENTITIES: 10,
  TREE_TRUNK: 11,
  TREE_FOLIAGE: 50,
  WEATHER: 100,
}

export interface WorldTree {
  trunk: Phaser.GameObjects.Sprite
  foliage: Phaser.GameObjects.Sprite
  x: number
  y: number
  swayOffset: number
}

export interface WorldFlower {
  sprite: Phaser.GameObjects.Sprite
  x: number
  y: number
  swayOffset: number
  type: string
}

export interface AmbientCreature {
  sprite: Phaser.GameObjects.Sprite
  vx: number
  vy: number
  lifetime: number
  type: 'butterfly' | 'ladybug'
}
