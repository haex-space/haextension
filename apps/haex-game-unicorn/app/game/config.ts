import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { OverworldScene } from './scenes/OverworldScene'

export const GAME_WIDTH = 480
export const GAME_HEIGHT = 320

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, OverworldScene],
    input: {
      activePointers: 2,
    },
    backgroundColor: '#4a7c59',
  }
}
