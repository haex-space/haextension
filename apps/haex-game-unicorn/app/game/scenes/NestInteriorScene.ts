import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { lerpColor } from '../utils/color'
import { DEPTH } from './nest-interior/constants'
import type { DraggableItem, Phase, WaxCell } from './nest-interior/constants'
import { drawHexagon, drawHexFilled } from './nest-interior/hexagon'
import { NestInteriorHud } from './nest-interior/NestInteriorHud'
import { ensurePollenBallTexture, ensureQueenInteriorTexture, ensureWaxPieceTexture } from './nest-interior/textures'

export class NestInteriorScene extends Phaser.Scene {
  private queenSprite!: Phaser.GameObjects.Sprite
  private waxCells: WaxCell[] = []
  private draggables: DraggableItem[] = []
  private activeDrag: DraggableItem | null = null

  // Build phase
  private phase: Phase = 'build-cells'
  private cellsBuilt = 0
  private cellsNeeded = 6
  private pollenFilled = 0
  private pollenNeeded = 4
  private eggsLaid = 0
  private eggsNeeded = 4

  // Brood phase
  private broodTemperature = 0.5
  private broodTimer = 0
  private broodDuration = 12000 // 12 seconds of brooding
  private isBrooding = false
  private tapCount = 0
  private tapTimer = 0

  // UI
  private hud!: NestInteriorHud

  constructor() {
    super({ key: 'NestInteriorScene' })
  }

  create() {
    this.resetState()
    this.createNestInterior()
    this.createQueen()
    this.hud = new NestInteriorHud(this)
    this.setupInput()

    this.cameras.main.fadeIn(800, 0, 0, 0)
    this.startBuildPhase()
  }

  override update(_time: number, delta: number) {
    switch (this.phase) {
      case 'build-cells':
        this.updateBuildPhase(delta)
        break
      case 'fill-pollen':
        this.updatePollenPhase(delta)
        break
      case 'lay-eggs':
        this.updateEggPhase(delta)
        break
      case 'brood':
        this.updateBroodPhase(delta)
        break
    }

    this.hud.update(this.phase, this.isBrooding, this.broodTemperature, this.broodTimer, this.broodDuration)
    this.animateQueen()
  }

  private resetState() {
    this.phase = 'build-cells'
    this.cellsBuilt = 0
    this.pollenFilled = 0
    this.eggsLaid = 0
    this.broodTemperature = 0.5
    this.broodTimer = 0
    this.isBrooding = false
    this.waxCells = []
    this.draggables = []
    this.activeDrag = null
  }

  // ── Nest Interior ───────────────────────────────

  private createNestInterior() {
    // Dark, cozy background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2a1a0a)
      .setDepth(DEPTH.BG)

    // Nest wall texture — rounded earthy enclosure
    const wall = this.add.graphics()
    wall.setDepth(DEPTH.NEST_WALL)

    // Outer wall
    wall.fillStyle(0x4a3a2a)
    wall.fillRoundedRect(40, 30, GAME_WIDTH - 80, GAME_HEIGHT - 60, 20)

    // Inner chamber (lighter)
    wall.fillStyle(0x5a4a3a)
    wall.fillRoundedRect(55, 45, GAME_WIDTH - 110, GAME_HEIGHT - 90, 16)

    // Nest material — moss/grass bits
    wall.fillStyle(0x4a7a3a, 0.3)
    for (let i = 0; i < 20; i++) {
      const mx = 60 + Math.random() * (GAME_WIDTH - 130)
      const my = 50 + Math.random() * (GAME_HEIGHT - 100)
      wall.fillRect(mx, my, 3 + Math.random() * 5, 1)
    }

    // Entrance hint (top, where queen came in)
    wall.fillStyle(0x1a0a00)
    wall.fillEllipse(GAME_WIDTH / 2, 35, 30, 15)

    // Cell placement grid — hexagonal positions
    this.createCellSlots()
  }

  private createCellSlots() {
    // Pre-defined positions for wax cells (rough hex grid in center)
    const centerX = GAME_WIDTH / 2
    const centerY = GAME_HEIGHT / 2 + 10
    const spacing = 28

    const positions = [
      { x: centerX - spacing, y: centerY - spacing * 0.5 },
      { x: centerX + spacing, y: centerY - spacing * 0.5 },
      { x: centerX, y: centerY + spacing * 0.3 },
      { x: centerX - spacing, y: centerY + spacing },
      { x: centerX + spacing, y: centerY + spacing },
      { x: centerX, y: centerY - spacing },
    ]

    for (const pos of positions) {
      // Ghost outline showing where cells go
      const ghost = this.add.graphics()
      ghost.setDepth(DEPTH.WAX_CELLS - 0.1)
      ghost.lineStyle(1, 0x8a7a5a, 0.3)
      drawHexagon(ghost, pos.x, pos.y, 12)

      this.waxCells.push({
        sprite: ghost,
        x: pos.x,
        y: pos.y,
        filled: false,
        type: 'empty',
      })
    }
  }

  // ── Queen ───────────────────────────────────────

  private createQueen() {
    ensureQueenInteriorTexture(this)

    this.queenSprite = this.add.sprite(GAME_WIDTH / 2 - 60, GAME_HEIGHT / 2 + 40, 'bee-queen-interior')
    this.queenSprite.setDepth(DEPTH.QUEEN)
    this.queenSprite.setScale(1.2)
  }

  private animateQueen() {
    // Gentle idle animation
    const time = this.time.now
    this.queenSprite.y = GAME_HEIGHT / 2 + 40 + Math.sin(time / 1000) * 1.5

    if (this.isBrooding) {
      // Vibrate while brooding
      this.queenSprite.x = GAME_WIDTH / 2 + Math.sin(time / 50) * 0.5
      this.queenSprite.y = GAME_HEIGHT / 2 + 10 + Math.sin(time / 1000) * 1
    }
  }

  // ── Build Phase ─────────────────────────────────

  private startBuildPhase() {
    this.phase = 'build-cells'
    this.spawnWaxPieces()
  }

  private spawnWaxPieces() {
    // Create draggable wax pieces on the queen's body area
    for (let i = 0; i < 3; i++) {
      this.spawnWaxPiece()
    }
  }

  private spawnWaxPiece() {
    ensureWaxPieceTexture(this)

    const sprite = this.add.sprite(
      this.queenSprite.x + 20 + Math.random() * 30,
      this.queenSprite.y - 10 + Math.random() * 20,
      'wax-piece',
    )
    sprite.setDepth(DEPTH.DRAG_ITEM)
    sprite.setInteractive({ draggable: true })

    const item: DraggableItem = { sprite, type: 'wax', isDragging: false }
    this.draggables.push(item)
  }

  private updateBuildPhase(_delta: number) {
    if (this.cellsBuilt >= this.cellsNeeded) {
      this.startPollenPhase()
    }
  }

  // ── Pollen Phase ────────────────────────────────

  private startPollenPhase() {
    this.phase = 'fill-pollen'
    this.clearDraggables()
    this.spawnPollenBalls()
  }

  private spawnPollenBalls() {
    ensurePollenBallTexture(this)

    for (let i = 0; i < 3; i++) {
      const sprite = this.add.sprite(
        80 + Math.random() * 40,
        GAME_HEIGHT - 80 + Math.random() * 20,
        'pollen-ball',
      )
      sprite.setDepth(DEPTH.DRAG_ITEM)
      sprite.setInteractive({ draggable: true })

      this.draggables.push({ sprite, type: 'pollen', isDragging: false })
    }
  }

  private updatePollenPhase(_delta: number) {
    if (this.pollenFilled >= this.pollenNeeded) {
      this.startEggPhase()
    }
  }

  // ── Egg Phase ───────────────────────────────────

  private startEggPhase() {
    this.phase = 'lay-eggs'
    this.clearDraggables()

    // Queen moves to cells to lay eggs — auto animation
    this.layEggsSequence()
  }

  private layEggsSequence() {
    const pollenCells = this.waxCells.filter(c => c.type === 'pollen')

    const layNext = (index: number) => {
      const cell = pollenCells[index]
      if (!cell || index >= this.eggsNeeded) {
        this.startBroodPhase()
        return
      }

      // Move queen to cell
      this.tweens.add({
        targets: this.queenSprite,
        x: cell.x - 15,
        y: cell.y,
        duration: 600,
        ease: 'Power1',
        onComplete: () => {
          // Lay egg animation
          this.time.delayedCall(400, () => {
            cell.type = 'egg'
            cell.sprite.clear()
            cell.sprite.fillStyle(0xe8d060)
            drawHexFilled(cell.sprite, cell.x, cell.y, 12)
            // Egg on top of pollen
            cell.sprite.fillStyle(0xffffee)
            cell.sprite.fillEllipse(cell.x, cell.y - 2, 4, 6)

            this.eggsLaid++
            this.time.delayedCall(300, () => layNext(index + 1))
          })
        },
      })
    }

    layNext(0)
  }

  private updateEggPhase(_delta: number) {
    // Handled by layEggsSequence
  }

  // ── Brood Phase ─────────────────────────────────

  private startBroodPhase() {
    this.phase = 'brood'
    this.broodTimer = 0
    this.broodTemperature = 0.5

    // Move queen on top of eggs
    const centerCell = this.waxCells.find(c => c.type === 'egg') || this.waxCells[0]
    this.tweens.add({
      targets: this.queenSprite,
      x: (GAME_WIDTH / 2),
      y: (GAME_HEIGHT / 2) + 10,
      duration: 800,
      onComplete: () => {
        this.isBrooding = true
      },
    })
  }

  private updateBroodPhase(delta: number) {
    if (!this.isBrooding) return

    // Temperature decays
    this.broodTemperature = Math.max(0, this.broodTemperature - 0.02 * (delta / 1000))

    // Rapid tapping heats up (vibrating)
    this.tapTimer += delta
    if (this.tapTimer > 300) {
      if (this.tapCount >= 2) {
        this.broodTemperature = Math.min(1, this.broodTemperature + 0.08)
      }
      this.tapCount = 0
      this.tapTimer = 0
    }

    // Progress if temperature stays warm enough
    if (this.broodTemperature > 0.3) {
      this.broodTimer += delta
    }

    // Color of cells reflects temperature
    for (const cell of this.waxCells.filter(c => c.type === 'egg')) {
      const warmth = this.broodTemperature
      const tint = lerpColor(0x6688aa, 0xffaa44, warmth)
      cell.sprite.clear()
      cell.sprite.fillStyle(tint)
      drawHexFilled(cell.sprite, cell.x, cell.y, 12)
      cell.sprite.fillStyle(0xffffee)
      cell.sprite.fillEllipse(cell.x, cell.y - 2, 4, 6)
    }

    // Complete!
    if (this.broodTimer >= this.broodDuration) {
      this.completeBroodPhase()
    }
  }

  private completeBroodPhase() {
    this.isBrooding = false

    // Eggs hatch into larvae — visual change
    for (const cell of this.waxCells.filter(c => c.type === 'egg')) {
      cell.type = 'larva'
      cell.sprite.clear()
      cell.sprite.fillStyle(0xe8d060)
      drawHexFilled(cell.sprite, cell.x, cell.y, 12)
      // Tiny C-shaped larva
      cell.sprite.fillStyle(0xffffcc)
      cell.sprite.lineStyle(2, 0xffffcc)
      cell.sprite.arc(cell.x, cell.y, 3, 0, Math.PI * 1.5, false)
      cell.sprite.strokePath()
    }

    // Victory! Chapter 3 complete
    this.time.delayedCall(2000, () => {
      this.cameras.main.fadeOut(1000, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.game.events.emit('task-complete', {
          taskId: 'nest-build',
          chapter: 3,
        })
        this.scene.start('OverworldScene')
      })
    })
  }

  // ── Input ───────────────────────────────────────

  private setupInput() {
    this.input.on('pointerdown', () => {
      this.tapCount++
    })

    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite, dragX: number, dragY: number) => {
      gameObject.x = dragX
      gameObject.y = dragY
      gameObject.setDepth(DEPTH.DRAG_ITEM + 1)
    })

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
      // Check if dropped on a cell
      const item = this.draggables.find(d => d.sprite === gameObject)
      if (!item) return

      for (const cell of this.waxCells) {
        const dist = Phaser.Math.Distance.Between(gameObject.x, gameObject.y, cell.x, cell.y)

        if (dist < 16) {
          if (item.type === 'wax' && cell.type === 'empty' && this.phase === 'build-cells') {
            // Build wax cell
            cell.type = 'empty'
            cell.filled = true
            cell.sprite.clear()
            cell.sprite.fillStyle(0xe8d060)
            drawHexFilled(cell.sprite, cell.x, cell.y, 12)
            cell.sprite.lineStyle(1, 0xc4a830)
            drawHexagon(cell.sprite, cell.x, cell.y, 12)

            this.cellsBuilt++
            gameObject.destroy()
            this.draggables = this.draggables.filter(d => d !== item)

            // Spawn more if needed
            if (this.draggables.filter(d => d.type === 'wax').length === 0 && this.cellsBuilt < this.cellsNeeded) {
              this.spawnWaxPiece()
              this.spawnWaxPiece()
            }
            return
          }

          if (item.type === 'pollen' && cell.filled && cell.type === 'empty' && this.phase === 'fill-pollen') {
            // Fill with pollen
            cell.type = 'pollen'
            cell.sprite.clear()
            cell.sprite.fillStyle(0xe8d060)
            drawHexFilled(cell.sprite, cell.x, cell.y, 12)
            // Pollen ball inside
            cell.sprite.fillStyle(0xffaa22)
            cell.sprite.fillCircle(cell.x, cell.y, 4)

            this.pollenFilled++
            gameObject.destroy()
            this.draggables = this.draggables.filter(d => d !== item)

            if (this.draggables.filter(d => d.type === 'pollen').length === 0 && this.pollenFilled < this.pollenNeeded) {
              this.time.delayedCall(300, () => {
                const sprite = this.add.sprite(
                  80 + Math.random() * 40,
                  GAME_HEIGHT - 80 + Math.random() * 20,
                  'pollen-ball',
                )
                sprite.setDepth(DEPTH.DRAG_ITEM)
                sprite.setInteractive({ draggable: true })
                this.draggables.push({ sprite, type: 'pollen', isDragging: false })
              })
            }
            return
          }
        }
      }

      // Not dropped on valid target — bounce back
      this.tweens.add({
        targets: gameObject,
        x: gameObject.x < GAME_WIDTH / 2 ? 90 : GAME_WIDTH - 90,
        y: GAME_HEIGHT - 70,
        duration: 200,
        ease: 'Back.easeOut',
      })
    })
  }

  // ── Helpers ─────────────────────────────────────

  private clearDraggables() {
    for (const d of this.draggables) {
      d.sprite.destroy()
    }
    this.draggables = []
  }
}
