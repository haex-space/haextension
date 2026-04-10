import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { BumblebeeQueen } from '../entities/BumblebeeQueen'

const TILE_SIZE = 16
const SCENE_WIDTH = 50
const SCENE_HEIGHT = 30

const DEPTH = {
  GROUND: 0,
  GROUND_DETAIL: 1,
  NEST_CANDIDATES: 3,
  FLOWERS: 5,
  ENTITY: 10,
  INDICATOR: 50,
  UI: 100,
}

interface NestCandidate {
  sprite: Phaser.GameObjects.Sprite
  x: number
  y: number
  type: 'mouse-hole' | 'grass-tuft' | 'tree-root' | 'bird-nest' | 'wet-ditch' | 'open-field'
  suitable: boolean
  inspected: boolean
  reactionPlayed: boolean
}

export class NestSearchScene extends Phaser.Scene {
  private queen!: BumblebeeQueen
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private touchTarget: { x: number, y: number } | null = null

  private candidates: NestCandidate[] = []
  private rng!: Phaser.Math.RandomDataGenerator

  // State
  private inspecting = false
  private chosenNest: NestCandidate | null = null

  constructor() {
    super({ key: 'NestSearchScene' })
  }

  create() {
    this.rng = new Phaser.Math.RandomDataGenerator(['nest-search-v1'])

    this.createGround()
    this.createNestCandidates()
    this.createScenery()
    this.createQueen()
    this.setupCamera()
    this.setupInput()

    // Entrance fade
    this.cameras.main.fadeIn(800, 0, 0, 0)
  }

  update(_time: number, delta: number) {
    if (!this.queen || this.inspecting) return

    this.queen.update(delta)
    this.handleInput()
    this.checkCandidateProximity()
    this.queen.setDepth(DEPTH.ENTITY + this.queen.sprite.y)

    // Queen slowly drains energy while searching
    // (she needs to find a nest before getting too tired)
  }

  // ── World ───────────────────────────────────────

  private createGround() {
    // Spring ground — slightly warmer than awakening
    for (let x = 0; x < SCENE_WIDTH; x++) {
      for (let y = 0; y < SCENE_HEIGHT; y++) {
        const tile = this.add.sprite(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 'grass')
        tile.setDepth(DEPTH.GROUND)
        if (this.rng.frac() > 0.8) {
          tile.setTint(0x4a8f3d)
        }
      }
    }

    this.physics.world.setBounds(0, 0, SCENE_WIDTH * TILE_SIZE, SCENE_HEIGHT * TILE_SIZE)
  }

  private createScenery() {
    // Scatter some flowers and grass to make the scene feel alive
    for (let i = 0; i < 20; i++) {
      const x = this.rng.between(TILE_SIZE * 2, SCENE_WIDTH * TILE_SIZE - TILE_SIZE * 2)
      const y = this.rng.between(TILE_SIZE * 2, SCENE_HEIGHT * TILE_SIZE - TILE_SIZE * 2)

      if (this.textures.exists('flower')) {
        const flower = this.add.sprite(x, y, 'flower')
        flower.setDepth(DEPTH.FLOWERS)
      }
    }
  }

  private createNestCandidates() {
    // Mouse hole — best option!
    this.createCandidateTexture('mouse-hole-tex', (gfx) => {
      gfx.fillStyle(0x7a6a4a)
      gfx.fillEllipse(12, 14, 20, 12)
      gfx.fillStyle(0x6a5a3a)
      gfx.fillEllipse(12, 12, 16, 10)
      // Hole entrance
      gfx.fillStyle(0x1a0a00)
      gfx.fillCircle(12, 14, 5)
      // Tiny mouse tracks
      gfx.fillStyle(0x8a7a5a, 0.4)
      gfx.fillCircle(18, 17, 1)
      gfx.fillCircle(21, 16, 1)
      gfx.fillCircle(24, 17, 1)
    }, 28, 20)

    // Grass tuft — decent option
    this.createCandidateTexture('grass-tuft-tex', (gfx) => {
      gfx.fillStyle(0x4a8f3d)
      gfx.fillTriangle(6, 20, 4, 2, 8, 20)
      gfx.fillTriangle(10, 20, 8, 0, 12, 20)
      gfx.fillTriangle(14, 20, 12, 3, 16, 20)
      gfx.fillTriangle(18, 20, 16, 1, 20, 20)
      gfx.fillStyle(0x5a4a2a, 0.5)
      gfx.fillEllipse(12, 18, 18, 6)
    }, 24, 22)

    // Tree root — ok option
    this.createCandidateTexture('tree-root-tex', (gfx) => {
      gfx.fillStyle(0x6b4423)
      gfx.fillRect(10, 0, 8, 10)
      // Roots spreading
      gfx.lineStyle(3, 0x5a3818)
      gfx.lineBetween(10, 8, 2, 18)
      gfx.lineBetween(18, 8, 26, 16)
      gfx.lineBetween(14, 10, 14, 20)
      // Sheltered gap
      gfx.fillStyle(0x2a1a0a, 0.6)
      gfx.fillEllipse(14, 16, 8, 6)
    }, 28, 22)

    // Wet ditch — unsuitable!
    this.createCandidateTexture('wet-ditch-tex', (gfx) => {
      gfx.fillStyle(0x4a6a3a)
      gfx.fillEllipse(14, 12, 24, 14)
      gfx.fillStyle(0x3a5a8a, 0.5)
      gfx.fillEllipse(14, 12, 18, 8)
      // Water shimmer
      gfx.fillStyle(0x6a9aba, 0.3)
      gfx.fillRect(8, 10, 4, 1)
      gfx.fillRect(16, 12, 6, 1)
    }, 28, 20)

    // Open field — unsuitable!
    this.createCandidateTexture('open-field-tex', (gfx) => {
      gfx.fillStyle(0x5a9f3d)
      gfx.fillRect(0, 8, 24, 12)
      // Exposed, flat
      gfx.fillStyle(0x6aaf4d)
      gfx.fillTriangle(4, 10, 3, 6, 5, 10)
      gfx.fillTriangle(12, 10, 11, 4, 13, 10)
      gfx.fillTriangle(20, 10, 19, 6, 21, 10)
    }, 24, 20)

    const candidateDefs: { type: NestCandidate['type'], texture: string, suitable: boolean }[] = [
      { type: 'mouse-hole', texture: 'mouse-hole-tex', suitable: true },
      { type: 'grass-tuft', texture: 'grass-tuft-tex', suitable: true },
      { type: 'tree-root', texture: 'tree-root-tex', suitable: true },
      { type: 'wet-ditch', texture: 'wet-ditch-tex', suitable: false },
      { type: 'open-field', texture: 'open-field-tex', suitable: false },
    ]

    // Place candidates across the map
    const positions = [
      { x: 120, y: 100 },
      { x: 350, y: 80 },
      { x: 200, y: 280 },
      { x: 500, y: 200 },
      { x: 650, y: 140 },
    ]

    for (let i = 0; i < candidateDefs.length; i++) {
      const def = candidateDefs[i]
      const pos = positions[i]

      const sprite = this.add.sprite(pos.x, pos.y, def.texture)
      sprite.setDepth(DEPTH.NEST_CANDIDATES)
      sprite.setInteractive({ useHandCursor: true })

      const candidate: NestCandidate = {
        sprite,
        x: pos.x,
        y: pos.y,
        type: def.type,
        suitable: def.suitable,
        inspected: false,
        reactionPlayed: false,
      }

      sprite.on('pointerdown', () => {
        this.moveToAndInspect(candidate)
      })

      this.candidates.push(candidate)
    }
  }

  private createCandidateTexture(key: string, drawFn: (gfx: Phaser.GameObjects.Graphics) => void, w: number, h: number) {
    if (this.textures.exists(key)) return
    const gfx = this.make.graphics({ x: 0, y: 0 })
    drawFn(gfx)
    gfx.generateTexture(key, w, h)
    gfx.destroy()
  }

  // ── Queen ───────────────────────────────────────

  private createQueen() {
    this.queen = new BumblebeeQueen(this, 60, SCENE_HEIGHT * TILE_SIZE / 2)
    this.queen.energy = 0.7 // Recovered from Chapter 1
    this.queen.bodyTemperature = 0.7 // Warm
  }

  // ── Inspection ──────────────────────────────────

  private moveToAndInspect(candidate: NestCandidate) {
    if (this.inspecting || candidate.inspected) return

    // Move queen toward the candidate
    this.touchTarget = null
    this.inspecting = true

    const targetX = candidate.x - 15
    const targetY = candidate.y + 5

    // Tween queen toward candidate
    const moveCheck = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const arrived = this.queen.moveTo(targetX, targetY)
        this.queen.update(16)
        this.queen.setDepth(DEPTH.ENTITY + this.queen.sprite.y)

        if (arrived) {
          moveCheck.destroy()
          this.playInspection(candidate)
        }
      },
    })
  }

  private playInspection(candidate: NestCandidate) {
    candidate.inspected = true

    // Queen sniffs (antennae animation = slight bob)
    this.tweens.add({
      targets: this.queen.sprite,
      y: this.queen.sprite.y - 2,
      duration: 200,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        if (candidate.suitable) {
          this.playPositiveReaction(candidate)
        }
        else {
          this.playNegativeReaction(candidate)
        }
      },
    })
  }

  private playPositiveReaction(candidate: NestCandidate) {
    // Queen nods (happy bounce)
    this.tweens.add({
      targets: this.queen.sprite,
      y: this.queen.sprite.y - 6,
      duration: 200,
      yoyo: true,
      repeat: 1,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        // Highlight: green glow
        const glow = this.add.ellipse(candidate.x, candidate.y, 36, 24, 0x44ff44, 0.2)
        glow.setDepth(DEPTH.NEST_CANDIDATES - 0.1)

        this.tweens.add({
          targets: glow,
          alpha: 0.35,
          duration: 500,
          yoyo: true,
          repeat: 2,
          onComplete: () => glow.destroy(),
        })

        // Any suitable nest can be selected — tap again to choose
        candidate.sprite.setInteractive({ useHandCursor: true })
        candidate.sprite.once('pointerdown', () => {
          this.selectNest(candidate)
        })
        this.inspecting = false
      },
    })
  }

  private playNegativeReaction(candidate: NestCandidate) {
    // Queen shakes head (horizontal shake)
    const origX = this.queen.sprite.x
    this.tweens.add({
      targets: this.queen.sprite,
      x: origX + 3,
      duration: 80,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.queen.sprite.x = origX

        // Red flash on unsuitable spot
        candidate.sprite.setTint(0xff8888)
        this.time.delayedCall(500, () => {
          candidate.sprite.setTint(0xaaaaaa)
        })

        this.inspecting = false
      },
    })
  }

  private selectNest(candidate: NestCandidate) {
    this.chosenNest = candidate
    this.inspecting = true

    // Queen enters the nest
    this.tweens.add({
      targets: this.queen.sprite,
      x: candidate.x,
      y: candidate.y,
      alpha: 0,
      scale: 0.5,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        // Fade out
        this.cameras.main.fadeOut(1000, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.game.events.emit('task-complete', {
            taskId: 'nest-search',
            chapter: 2,
          })
          this.scene.start('NestInteriorScene')
        })
      },
    })
  }

  // ── Input ───────────────────────────────────────

  private setupCamera() {
    this.cameras.main.startFollow(this.queen.sprite, true, 0.08, 0.08)
    this.cameras.main.setBounds(0, 0, SCENE_WIDTH * TILE_SIZE, SCENE_HEIGHT * TILE_SIZE)
    this.cameras.main.setZoom(2)
  }

  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys()
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.inspecting) return
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      this.touchTarget = { x: worldPoint.x, y: worldPoint.y }
    })

    this.input.on('pointerup', () => {
      this.touchTarget = null
      if (!this.inspecting) this.queen.stop()
    })
  }

  private handleInput() {
    if (this.inspecting) return

    if (this.cursors) {
      const left = this.cursors.left.isDown
      const right = this.cursors.right.isDown
      const up = this.cursors.up.isDown
      const down = this.cursors.down.isDown

      if (left || right || up || down) {
        this.touchTarget = null
        let vx = 0
        let vy = 0
        if (left) vx = -1
        if (right) vx = 1
        if (up) vy = -1
        if (down) vy = 1

        const speed = this.queen.speed
        const len = Math.sqrt(vx * vx + vy * vy) || 1
        const body = this.queen.sprite.body as Phaser.Physics.Arcade.Body
        body.setVelocity((vx / len) * speed, (vy / len) * speed)

        if (vx < 0) this.queen.sprite.setFlipX(false)
        else if (vx > 0) this.queen.sprite.setFlipX(true)
        return
      }
    }

    if (this.touchTarget) {
      this.queen.moveTo(this.touchTarget.x, this.touchTarget.y)
      return
    }

    this.queen.stop()
  }

  private checkCandidateProximity() {
    for (const c of this.candidates) {
      if (c.inspected) continue

      const dist = Phaser.Math.Distance.Between(
        this.queen.sprite.x,
        this.queen.sprite.y,
        c.x,
        c.y,
      )

      // Pulse when nearby to indicate interactable
      if (dist < 40) {
        const pulse = 1 + Math.sin(this.time.now / 400) * 0.06
        c.sprite.setScale(pulse)
      }
      else {
        c.sprite.setScale(1)
      }
    }
  }
}
