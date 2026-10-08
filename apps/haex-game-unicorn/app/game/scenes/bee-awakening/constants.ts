import type Phaser from 'phaser'

export const TILE_SIZE = 16
export const SCENE_WIDTH = 40
export const SCENE_HEIGHT = 25

export const DEPTH = {
  GROUND: 0,
  GROUND_DETAIL: 1,
  FLOWERS: 5,
  ENTITY: 10,
  UI: 100,
}

export interface EarlyFlower {
  sprite: Phaser.GameObjects.Sprite
  type: 'crocus' | 'willow-catkin' | 'snowdrop'
  x: number
  y: number
  hasNectar: boolean
  interactionZone: Phaser.GameObjects.Zone
}
