import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'

const DEPTH = {
  BG: 0,
  NEST_WALL: 1,
  WAX_CELLS: 5,
  EGGS: 6,
  QUEEN: 10,
  DRAG_ITEM: 20,
  UI: 50,
  OVERLAY: 90,
}

interface WaxCell {
  sprite: Phaser.GameObjects.Graphics
  x: number
  y: number
  filled: boolean // has pollen/egg
  type: 'empty' | 'pollen' | 'egg' | 'larva'
}

interface DraggableItem {
  sprite: Phaser.GameObjects.Sprite
  type: 'wax' | 'pollen'
  isDragging: boolean
}

type Phase = 'build-cells' | 'fill-pollen' | 'lay-eggs' | 'brood'

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
  private phaseIndicator!: Phaser.GameObjects.Graphics
  private temperatureBar!: Phaser.GameObjects.Graphics

  constructor() {
    super({ key: 'NestInteriorScene' })
  }

  create() {
    this.resetState()
    this.createNestInterior()
    this.createQueen()
    this.createUI()
    this.setupInput()

    this.cameras.main.fadeIn(800, 0, 0, 0)
    this.startBuildPhase()
  }

  update(_time: number, delta: number) {
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

    this.updateUI()
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
      this.drawHexagon(ghost, pos.x, pos.y, 12)

      this.waxCells.push({
        sprite: ghost,
        x: pos.x,
        y: pos.y,
        filled: false,
        type: 'empty',
      })
    }
  }

  private drawHexagon(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, fill = false) {
    const points: number[] = []
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6
      points.push(cx + r * Math.cos(angle))
      points.push(cy + r * Math.sin(angle))
    }

    if (fill) {
      gfx.fillPoints(points.map((v, i) => i % 2 === 0
        ? new Phaser.Geom.Point(v, points[i + 1])
        : undefined,
      ).filter(Boolean) as Phaser.Geom.Point[], true)
    }
    else {
      gfx.strokePoints(points.map((v, i) => i % 2 === 0
        ? new Phaser.Geom.Point(v, points[i + 1])
        : undefined,
      ).filter(Boolean) as Phaser.Geom.Point[], true)
    }
  }

  // ── Queen ───────────────────────────────────────

  private createQueen() {
    if (!this.textures.exists('bee-queen-interior')) {
      const gfx = this.make.graphics({ x: 0, y: 0 })
      // Larger, more detailed bumblebee queen for interior view
      // Black body base
      gfx.fillStyle(0x1a1a1a)
      gfx.fillEllipse(20, 18, 30, 20)
      // Yellow band front
      gfx.fillStyle(0xf0c830)
      gfx.fillRect(10, 12, 14, 5)
      // Yellow band rear
      gfx.fillStyle(0xf0c830)
      gfx.fillRect(16, 22, 12, 4)
      // Orange tail
      gfx.fillStyle(0xe06030)
      gfx.fillEllipse(32, 20, 10, 12)
      // Head — black
      gfx.fillStyle(0x1a1a1a)
      gfx.fillCircle(5, 14, 7)
      // Eyes
      gfx.fillStyle(0x222222)
      gfx.fillCircle(3, 12, 2)
      // Wings folded
      gfx.fillStyle(0xccccee, 0.3)
      gfx.fillEllipse(18, 8, 16, 8)
      gfx.generateTexture('bee-queen-interior', 40, 30)
      gfx.destroy()
    }

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
    if (!this.textures.exists('wax-piece')) {
      const gfx = this.make.graphics({ x: 0, y: 0 })
      gfx.fillStyle(0xe8d060)
      gfx.fillEllipse(6, 6, 10, 8)
      gfx.fillStyle(0xd4bc40, 0.5)
      gfx.fillEllipse(5, 5, 6, 4)
      gfx.generateTexture('wax-piece', 12, 12)
      gfx.destroy()
    }

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
    if (!this.textures.exists('pollen-ball')) {
      const gfx = this.make.graphics({ x: 0, y: 0 })
      gfx.fillStyle(0xffaa22)
      gfx.fillCircle(5, 5, 5)
      gfx.fillStyle(0xffcc44, 0.5)
      gfx.fillCircle(4, 4, 2)
      gfx.generateTexture('pollen-ball', 10, 10)
      gfx.destroy()
    }

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
      if (index >= pollenCells.length || index >= this.eggsNeeded) {
        this.startBroodPhase()
        return
      }

      const cell = pollenCells[index]

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
            this.drawHexFilled(cell.sprite, cell.x, cell.y, 12)
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
      const tint = this.lerpColor(0x6688aa, 0xffaa44, warmth)
      cell.sprite.clear()
      cell.sprite.fillStyle(tint)
      this.drawHexFilled(cell.sprite, cell.x, cell.y, 12)
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
      this.drawHexFilled(cell.sprite, cell.x, cell.y, 12)
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
            this.drawHexFilled(cell.sprite, cell.x, cell.y, 12)
            cell.sprite.lineStyle(1, 0xc4a830)
            this.drawHexagon(cell.sprite, cell.x, cell.y, 12)

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
            this.drawHexFilled(cell.sprite, cell.x, cell.y, 12)
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

  // ── UI ──────────────────────────────────────────

  private createUI() {
    this.createBackButton()

    this.phaseIndicator = this.add.graphics()
    this.phaseIndicator.setDepth(DEPTH.UI)
    this.phaseIndicator.setScrollFactor(0)

    this.temperatureBar = this.add.graphics()
    this.temperatureBar.setDepth(DEPTH.UI)
    this.temperatureBar.setScrollFactor(0)
  }

  private createBackButton() {
    const btn = this.add.graphics()
    btn.setScrollFactor(0)
    btn.setDepth(DEPTH.UI)

    btn.fillStyle(0x000000, 0.3)
    btn.fillCircle(GAME_WIDTH - 16, 16, 10)
    btn.lineStyle(2, 0xffffff, 0.7)
    btn.lineBetween(GAME_WIDTH - 20, 16, GAME_WIDTH - 13, 16)
    btn.lineBetween(GAME_WIDTH - 20, 16, GAME_WIDTH - 17, 13)
    btn.lineBetween(GAME_WIDTH - 20, 16, GAME_WIDTH - 17, 19)

    const hitZone = this.add.zone(GAME_WIDTH - 16, 16, 24, 24)
    hitZone.setScrollFactor(0)
    hitZone.setDepth(DEPTH.UI)
    hitZone.setInteractive({ useHandCursor: true })
    hitZone.on('pointerdown', () => this.returnToOverworld())
  }

  private returnToOverworld() {
    this.input.removeAllListeners()
    this.cameras.main.fadeOut(600, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('OverworldScene')
    })
  }

  private updateUI() {
    this.phaseIndicator.clear()

    // Phase progress dots (top center)
    const phases: Phase[] = ['build-cells', 'fill-pollen', 'lay-eggs', 'brood']
    const currentIdx = phases.indexOf(this.phase)

    for (let i = 0; i < phases.length; i++) {
      const x = GAME_WIDTH / 2 - 30 + i * 20
      const y = 12
      const isActive = i === currentIdx
      const isDone = i < currentIdx

      this.phaseIndicator.fillStyle(
        isDone ? 0x88cc88 : isActive ? 0xffdd44 : 0x666666,
        isDone ? 0.8 : isActive ? 0.9 : 0.4,
      )
      this.phaseIndicator.fillCircle(x, y, isActive ? 5 : 3)
    }

    // Temperature bar during brood phase
    this.temperatureBar.clear()
    if (this.phase === 'brood' && this.isBrooding) {
      const barX = GAME_WIDTH - 20
      const barY = 40
      const barH = 80

      // Background
      this.temperatureBar.fillStyle(0x333333, 0.5)
      this.temperatureBar.fillRoundedRect(barX, barY, 6, barH, 3)

      // Fill
      const fillH = barH * this.broodTemperature
      const color = this.lerpColor(0x4488ff, 0xff6622, this.broodTemperature)
      this.temperatureBar.fillStyle(color, 0.8)
      this.temperatureBar.fillRoundedRect(barX, barY + barH - fillH, 6, fillH, 3)

      // Progress bar at bottom
      const progW = GAME_WIDTH - 100
      const progX = 50
      const progY = GAME_HEIGHT - 20
      this.temperatureBar.fillStyle(0x333333, 0.4)
      this.temperatureBar.fillRoundedRect(progX, progY, progW, 4, 2)
      this.temperatureBar.fillStyle(0xffdd44, 0.7)
      this.temperatureBar.fillRoundedRect(progX, progY, progW * (this.broodTimer / this.broodDuration), 4, 2)
    }
  }

  // ── Helpers ─────────────────────────────────────

  private drawHexFilled(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
    const points: Phaser.Geom.Point[] = []
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6
      points.push(new Phaser.Geom.Point(cx + r * Math.cos(angle), cy + r * Math.sin(angle)))
    }
    gfx.fillPoints(points, true)
  }

  private clearDraggables() {
    for (const d of this.draggables) {
      d.sprite.destroy()
    }
    this.draggables = []
  }

  private lerpColor(from: number, to: number, t: number): number {
    const fr = (from >> 16) & 0xff
    const fg = (from >> 8) & 0xff
    const fb = from & 0xff
    const tr = (to >> 16) & 0xff
    const tg = (to >> 8) & 0xff
    const tb = to & 0xff
    const r = Math.round(fr + (tr - fr) * t)
    const g = Math.round(fg + (tg - fg) * t)
    const b = Math.round(fb + (tb - fb) * t)
    return (r << 16) | (g << 8) | b
  }
}
