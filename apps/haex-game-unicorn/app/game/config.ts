import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { OverworldScene } from './scenes/OverworldScene'
import { BeeAwakeningScene } from './scenes/BeeAwakeningScene'
import { NestSearchScene } from './scenes/NestSearchScene'
import { CutsceneScene } from './scenes/CutsceneScene'
import { NestInteriorScene } from './scenes/NestInteriorScene'

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
    scene: [BootScene, OverworldScene, BeeAwakeningScene, NestSearchScene, CutsceneScene, NestInteriorScene],
    input: {
      activePointers: 2,
    },
    backgroundColor: '#4a7c59',
  }
}
