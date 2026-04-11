import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'

import unicornSheet from '~/assets/sprites/characters/unicorn-spritesheet.png'
import grassTile from '~/assets/sprites/tiles/grass.png'
import tallGrassTile from '~/assets/sprites/tiles/tall-grass.png'
import treeTrunk from '~/assets/sprites/tiles/tree-trunk.png'
import treeFoliage from '~/assets/sprites/tiles/tree-foliage.png'
import flowerPink from '~/assets/sprites/tiles/flower-pink.png'
import flowerBlue from '~/assets/sprites/tiles/flower-blue.png'
import flowerYellow from '~/assets/sprites/tiles/flower-yellow.png'
import flowerWhite from '~/assets/sprites/tiles/flower-white.png'
import flowerPurple from '~/assets/sprites/tiles/flower-purple.png'
import bumblebeeNest from '~/assets/sprites/tiles/bumblebee-nest.png'
import mountainsTex from '~/assets/sprites/parallax/mountains.png'
import farTreesTex from '~/assets/sprites/parallax/far-trees.png'
import cloudSprite from '~/assets/sprites/ambient/cloud.png'
import butterflySprite from '~/assets/sprites/ambient/butterfly.png'
import ladybugSprite from '~/assets/sprites/ambient/ladybug.png'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    this.createLoadingBar()
    this.loadAssets()
  }

  create() {
    this.createAnimations()
    this.scene.start('OverworldScene')
  }

  private createLoadingBar() {
    const centerX = GAME_WIDTH / 2
    const centerY = GAME_HEIGHT / 2

    const barWidth = 200
    const barHeight = 16

    const bgBar = this.add.rectangle(centerX, centerY, barWidth, barHeight, 0x3a5a40)
    bgBar.setStrokeStyle(2, 0x2d4a30)

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

  private loadAssets() {
    // Unicorn spritesheet: 1000x844, 4x4 grid = 250x211 per frame
    this.load.spritesheet('unicorn', unicornSheet, {
      frameWidth: 250,
      frameHeight: 211,
    })

    // Overworld tiles & sprites
    this.load.image('grass', grassTile)
    this.load.image('tall-grass', tallGrassTile)
    this.load.image('tree-trunk', treeTrunk)
    this.load.image('tree-foliage', treeFoliage)
    this.load.image('flower-pink', flowerPink)
    this.load.image('flower-blue', flowerBlue)
    this.load.image('flower-yellow', flowerYellow)
    this.load.image('flower-white', flowerWhite)
    this.load.image('flower-purple', flowerPurple)
    this.load.image('bumblebee-nest', bumblebeeNest)

    // Parallax layers
    this.load.image('mountains-tex', mountainsTex)
    this.load.image('far-trees-tex', farTreesTex)

    // Ambient sprites
    this.load.image('cloud', cloudSprite)
    this.load.image('butterfly', butterflySprite)
    this.load.image('ladybug', ladybugSprite)
  }

  private createAnimations() {
    // Unicorn walk animations
    // Row 0 (frames 0-3): Walking DOWN
    // Row 1 (frames 4-7): Walking LEFT
    // Row 2 (frames 8-11): Walking RIGHT
    // Row 3 (frames 12-15): Walking UP

    this.anims.create({
      key: 'unicorn-walk-down',
      frames: this.anims.generateFrameNumbers('unicorn', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    })

    this.anims.create({
      key: 'unicorn-walk-left',
      frames: this.anims.generateFrameNumbers('unicorn', { start: 4, end: 7 }),
      frameRate: 6,
      repeat: -1,
    })

    this.anims.create({
      key: 'unicorn-walk-right',
      frames: this.anims.generateFrameNumbers('unicorn', { start: 8, end: 11 }),
      frameRate: 6,
      repeat: -1,
    })

    this.anims.create({
      key: 'unicorn-walk-up',
      frames: this.anims.generateFrameNumbers('unicorn', { start: 12, end: 15 }),
      frameRate: 6,
      repeat: -1,
    })

    // Idle = first frame of down walk
    this.anims.create({
      key: 'unicorn-idle',
      frames: [{ key: 'unicorn', frame: 0 }],
      frameRate: 1,
    })
  }
}
