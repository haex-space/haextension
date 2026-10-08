import type Phaser from 'phaser'

export const DEPTH = {
  BG: 0,
  NEST_WALL: 1,
  WAX_CELLS: 5,
  EGGS: 6,
  QUEEN: 10,
  DRAG_ITEM: 20,
  UI: 50,
  OVERLAY: 90,
}

export interface WaxCell {
  sprite: Phaser.GameObjects.Graphics
  x: number
  y: number
  filled: boolean // has pollen/egg
  type: 'empty' | 'pollen' | 'egg' | 'larva'
}

export interface DraggableItem {
  sprite: Phaser.GameObjects.Sprite
  type: 'wax' | 'pollen'
  isDragging: boolean
}

export type Phase = 'build-cells' | 'fill-pollen' | 'lay-eggs' | 'brood'

