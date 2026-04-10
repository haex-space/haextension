import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'

const TILE_SIZE = 16
const MAP_WIDTH = 60
const MAP_HEIGHT = 40
const UNICORN_SPEED = 100

export class OverworldScene extends Phaser.Scene {
  private unicorn!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private touchTarget: { x: number, y: number } | null = null
  private flowers: Phaser.GameObjects.Sprite[] = []
  private trees: Phaser.GameObjects.Sprite[] = []
  private bumblebeeNest: Phaser.GameObjects.Sprite | null = null

  constructor() {
    super({ key: 'OverworldScene' })
  }

  create() {
    this.createWorld()
    this.createUnicorn()
    this.createDecorations()
    this.createBumblebeeNest()
    this.setupCamera()
    this.setupInput()

    this.emitEvent('scene-ready', { scene: 'OverworldScene' })
  }

  update() {
    this.handleMovement()
    this.animateWorld()
  }

  private createWorld() {
    // Tile the ground
    for (let x = 0; x < MAP_WIDTH; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const grass = this.add.sprite(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 'grass')
        // Slight color variation for natural look
        if (Math.random() > 0.7) {
          grass.setTint(0x4a8f3d)
        }
      }
    }

    // World bounds
    this.physics.world.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
  }

  private createUnicorn() {
    const startX = (MAP_WIDTH * TILE_SIZE) / 2
    const startY = (MAP_HEIGHT * TILE_SIZE) / 2

    this.unicorn = this.physics.add.sprite(startX, startY, 'unicorn')
    this.unicorn.setCollideWorldBounds(true)
    this.unicorn.setDepth(10)
  }

  private createDecorations() {
    const rng = new Phaser.Math.RandomDataGenerator(['meadow-seed'])

    // Scatter flowers
    for (let i = 0; i < 40; i++) {
      const x = rng.between(TILE_SIZE * 2, MAP_WIDTH * TILE_SIZE - TILE_SIZE * 2)
      const y = rng.between(TILE_SIZE * 2, MAP_HEIGHT * TILE_SIZE - TILE_SIZE * 2)
      const flower = this.add.sprite(x, y, 'flower')
      flower.setDepth(2)
      this.flowers.push(flower)
    }

    // Scatter trees
    for (let i = 0; i < 15; i++) {
      const x = rng.between(TILE_SIZE * 3, MAP_WIDTH * TILE_SIZE - TILE_SIZE * 3)
      const y = rng.between(TILE_SIZE * 3, MAP_HEIGHT * TILE_SIZE - TILE_SIZE * 3)
      const tree = this.add.sprite(x, y, 'tree')
      tree.setDepth(y) // Trees in front if lower on screen
      this.trees.push(tree)
    }
  }

  private createBumblebeeNest() {
    const nestX = (MAP_WIDTH * TILE_SIZE) / 2 + 120
    const nestY = (MAP_HEIGHT * TILE_SIZE) / 2 - 80

    this.bumblebeeNest = this.add.sprite(nestX, nestY, 'bumblebee-nest')
    this.bumblebeeNest.setDepth(3)
    this.bumblebeeNest.setInteractive({ useHandCursor: true })

    this.bumblebeeNest.on('pointerdown', () => {
      this.emitEvent('nest-interact', { nestType: 'bumblebee' })
    })
  }

  private setupCamera() {
    this.cameras.main.startFollow(this.unicorn, true, 0.08, 0.08)
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
    this.cameras.main.setZoom(2)
  }

  private setupInput() {
    // Keyboard
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys()
    }

    // Touch / Mouse — tap to move
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      this.touchTarget = { x: worldPoint.x, y: worldPoint.y }
    })

    this.input.on('pointerup', () => {
      this.touchTarget = null
      this.unicorn.setVelocity(0, 0)
    })
  }

  private handleMovement() {
    const body = this.unicorn.body as Phaser.Physics.Arcade.Body

    // Keyboard movement
    if (this.cursors) {
      const left = this.cursors.left.isDown
      const right = this.cursors.right.isDown
      const up = this.cursors.up.isDown
      const down = this.cursors.down.isDown

      if (left || right || up || down) {
        this.touchTarget = null

        let vx = 0
        let vy = 0
        if (left) vx = -UNICORN_SPEED
        if (right) vx = UNICORN_SPEED
        if (up) vy = -UNICORN_SPEED
        if (down) vy = UNICORN_SPEED

        // Normalize diagonal movement
        if (vx !== 0 && vy !== 0) {
          const factor = Math.SQRT1_2
          vx *= factor
          vy *= factor
        }

        body.setVelocity(vx, vy)

        // Flip sprite based on direction
        if (vx < 0) this.unicorn.setFlipX(true)
        else if (vx > 0) this.unicorn.setFlipX(false)

        return
      }
    }

    // Touch movement — move toward target
    if (this.touchTarget) {
      const dx = this.touchTarget.x - this.unicorn.x
      const dy = this.touchTarget.y - this.unicorn.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 4) {
        body.setVelocity(0, 0)
        this.touchTarget = null
        return
      }

      const vx = (dx / distance) * UNICORN_SPEED
      const vy = (dy / distance) * UNICORN_SPEED
      body.setVelocity(vx, vy)

      if (vx < 0) this.unicorn.setFlipX(true)
      else if (vx > 0) this.unicorn.setFlipX(false)

      return
    }

    // No input — stop
    body.setVelocity(0, 0)
  }

  private animateWorld() {
    // Gentle flower sway
    const time = this.time.now
    for (const flower of this.flowers) {
      flower.setRotation(Math.sin(time / 1000 + flower.x) * 0.05)
    }
  }

  private emitEvent(event: string, data: Record<string, unknown>) {
    this.game.events.emit(event, data)
  }
}
