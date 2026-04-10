import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { BumblebeeQueen } from '../entities/BumblebeeQueen'
import { createNestFoundCutscene } from './CutsceneScene'

const TILE_SIZE = 16
const SCENE_WIDTH = 40
const SCENE_HEIGHT = 25

const DEPTH = {
  GROUND: 0,
  GROUND_DETAIL: 1,
  FLOWERS: 5,
  ENTITY: 10,
  UI: 100,
}

interface EarlyFlower {
  sprite: Phaser.GameObjects.Sprite
  type: 'crocus' | 'willow-catkin' | 'snowdrop'
  x: number
  y: number
  hasNectar: boolean
  interactionZone: Phaser.GameObjects.Zone
}

export class BeeAwakeningScene extends Phaser.Scene {
  private queen!: BumblebeeQueen
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private touchTarget: { x: number, y: number } | null = null

  private earlyFlowers: EarlyFlower[] = []
  private rng!: Phaser.Math.RandomDataGenerator

  // UI
  private temperatureIndicator!: Phaser.GameObjects.Graphics
  private energyIndicator!: Phaser.GameObjects.Graphics
  private vibrateHint!: Phaser.GameObjects.Sprite
  private vibrateHintVisible = false

  // State
  private isCollectingNectar = false
  private collectTarget: EarlyFlower | null = null
  private flowersVisited = 0
  private hasShownVibrateHint = false
  private tapCount = 0
  private tapTimer = 0

  constructor() {
    super({ key: 'BeeAwakeningScene' })
  }

  create() {
    this.rng = new Phaser.Math.RandomDataGenerator(['awakening-v1'])

    this.createGround()
    this.createEarlySpringFlowers()
    this.createEmergencePoint()
    this.createQueen()
    this.createUI()
    this.setupCamera()
    this.setupInput()

    // Entrance animation: queen crawls out of earth
    this.playEmergenceAnimation()
  }

  update(_time: number, delta: number) {
    if (!this.queen) return

    this.queen.update(delta)
    this.handleInput()
    this.checkFlowerProximity()
    this.updateUI(delta)
    this.animateScene(delta)
    this.checkVibrationInput(delta)

    // Depth sort
    this.queen.setDepth(DEPTH.ENTITY + this.queen.sprite.y)

    // Check if queen is too cold / hungry — show hints
    if (this.queen.bodyTemperature < 0.3 && !this.hasShownVibrateHint) {
      this.showVibrateHint()
    }

    // Win condition: visited enough flowers and energy recovered
    if (this.flowersVisited >= 3 && this.queen.energy > 0.6) {
      this.completeChapter()
    }
  }

  // ── World Building ──────────────────────────────

  private createGround() {
    // Early spring ground — frosty, sparse
    const frostGrassGfx = this.make.graphics({ x: 0, y: 0 })
    frostGrassGfx.fillStyle(0x6a8a5a)
    frostGrassGfx.fillRect(0, 0, 16, 16)
    frostGrassGfx.fillStyle(0x8aaa7a, 0.3)
    frostGrassGfx.fillRect(4, 4, 2, 2) // frost spots
    frostGrassGfx.fillRect(10, 8, 3, 2)
    frostGrassGfx.generateTexture('frost-grass', 16, 16)
    frostGrassGfx.destroy()

    for (let x = 0; x < SCENE_WIDTH; x++) {
      for (let y = 0; y < SCENE_HEIGHT; y++) {
        const tile = this.add.sprite(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 'frost-grass')
        tile.setDepth(DEPTH.GROUND)
        if (this.rng.frac() > 0.8) {
          tile.setTint(0x7a9a6a)
        }
      }
    }

    this.physics.world.setBounds(0, 0, SCENE_WIDTH * TILE_SIZE, SCENE_HEIGHT * TILE_SIZE)
  }

  private createEmergencePoint() {
    // Mound of earth where queen emerges
    const moundGfx = this.make.graphics({ x: 0, y: 0 })
    moundGfx.fillStyle(0x6a5a3a)
    moundGfx.fillEllipse(16, 12, 28, 16)
    moundGfx.fillStyle(0x5a4a2a)
    moundGfx.fillEllipse(16, 10, 22, 12)
    // Small hole
    moundGfx.fillStyle(0x2a1a0a)
    moundGfx.fillCircle(16, 12, 5)
    moundGfx.generateTexture('emergence-mound', 32, 20)
    moundGfx.destroy()

    const cx = (SCENE_WIDTH * TILE_SIZE) / 2
    const cy = (SCENE_HEIGHT * TILE_SIZE) / 2 + 40
    this.add.sprite(cx, cy, 'emergence-mound').setDepth(DEPTH.GROUND_DETAIL)
  }

  private createEarlySpringFlowers() {
    // Crocus texture
    const crocusGfx = this.make.graphics({ x: 0, y: 0 })
    crocusGfx.fillStyle(0x3a6a28)
    crocusGfx.fillRect(7, 10, 2, 6)
    crocusGfx.fillStyle(0xbb77ff)
    crocusGfx.fillEllipse(8, 7, 6, 8)
    crocusGfx.fillStyle(0xffcc44)
    crocusGfx.fillCircle(8, 7, 1.5)
    crocusGfx.generateTexture('crocus', 16, 16)
    crocusGfx.destroy()

    // Snowdrop texture
    const snowdropGfx = this.make.graphics({ x: 0, y: 0 })
    snowdropGfx.fillStyle(0x3a6a28)
    snowdropGfx.fillRect(7, 6, 1, 10)
    snowdropGfx.lineStyle(1, 0x3a6a28)
    snowdropGfx.lineBetween(7, 6, 5, 8)
    snowdropGfx.fillStyle(0xffffff)
    snowdropGfx.fillEllipse(4, 10, 4, 6)
    snowdropGfx.generateTexture('snowdrop', 12, 16)
    snowdropGfx.destroy()

    // Willow catkin texture
    const willowGfx = this.make.graphics({ x: 0, y: 0 })
    willowGfx.fillStyle(0x6a5a3a)
    willowGfx.fillRect(7, 0, 2, 16)
    willowGfx.fillStyle(0xdddd88)
    willowGfx.fillEllipse(8, 4, 5, 6)
    willowGfx.fillEllipse(8, 10, 4, 5)
    willowGfx.generateTexture('willow-catkin', 16, 16)
    willowGfx.destroy()

    const flowerDefs: { type: EarlyFlower['type'], texture: string }[] = [
      { type: 'crocus', texture: 'crocus' },
      { type: 'crocus', texture: 'crocus' },
      { type: 'snowdrop', texture: 'snowdrop' },
      { type: 'snowdrop', texture: 'snowdrop' },
      { type: 'willow-catkin', texture: 'willow-catkin' },
    ]

    // Scatter sparsely — early spring, not many flowers yet
    for (const def of flowerDefs) {
      const x = this.rng.between(TILE_SIZE * 3, SCENE_WIDTH * TILE_SIZE - TILE_SIZE * 3)
      const y = this.rng.between(TILE_SIZE * 3, SCENE_HEIGHT * TILE_SIZE - TILE_SIZE * 3)

      const sprite = this.add.sprite(x, y, def.texture)
      sprite.setDepth(DEPTH.FLOWERS)

      // Interaction zone
      const zone = this.add.zone(x, y, 24, 24)
      this.physics.add.existing(zone, true)

      this.earlyFlowers.push({
        sprite,
        type: def.type,
        x,
        y,
        hasNectar: true,
        interactionZone: zone,
      })
    }
  }

  // ── Queen ───────────────────────────────────────

  private createQueen() {
    const cx = (SCENE_WIDTH * TILE_SIZE) / 2
    const cy = (SCENE_HEIGHT * TILE_SIZE) / 2 + 40

    this.queen = new BumblebeeQueen(this, cx, cy - 5)
    this.queen.energy = 0.35 // Low after hibernation
    this.queen.bodyTemperature = 0.15 // Very cold
    this.queen.sprite.setAlpha(0) // Hidden for emergence animation
  }

  private playEmergenceAnimation() {
    // Queen slowly appears from the ground
    this.tweens.add({
      targets: this.queen.sprite,
      alpha: { from: 0, to: 1 },
      y: this.queen.sprite.y - 10,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => {
        // Small shake — waking up
        this.tweens.add({
          targets: this.queen.sprite,
          x: this.queen.sprite.x + 1,
          duration: 100,
          yoyo: true,
          repeat: 3,
        })
      },
    })
  }

  // ── UI (no text, visual only) ───────────────────

  private createUI() {
    // Temperature indicator — top-left, small thermometer visual
    this.temperatureIndicator = this.add.graphics()
    this.temperatureIndicator.setScrollFactor(0)
    this.temperatureIndicator.setDepth(DEPTH.UI)

    // Energy indicator — top-left below temperature, belly shape
    this.energyIndicator = this.add.graphics()
    this.energyIndicator.setScrollFactor(0)
    this.energyIndicator.setDepth(DEPTH.UI)

    // Vibrate hint (hidden initially)
    if (!this.textures.exists('vibrate-hint')) {
      const gfx = this.make.graphics({ x: 0, y: 0 })
      // Hand/tap icon
      gfx.fillStyle(0xffffff, 0.9)
      gfx.fillRoundedRect(2, 2, 20, 20, 4)
      gfx.fillStyle(0xff8844)
      gfx.fillCircle(12, 12, 5)
      // Tap lines
      gfx.lineStyle(1, 0xff8844, 0.7)
      gfx.lineBetween(12, 4, 12, 2)
      gfx.lineBetween(4, 12, 2, 12)
      gfx.lineBetween(20, 12, 22, 12)
      gfx.generateTexture('vibrate-hint', 24, 24)
      gfx.destroy()
    }

    this.vibrateHint = this.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'vibrate-hint')
    this.vibrateHint.setScrollFactor(0)
    this.vibrateHint.setDepth(DEPTH.UI)
    this.vibrateHint.setAlpha(0)
    this.vibrateHint.setScale(1.5)
  }

  private updateUI(_delta: number) {
    // Temperature: small bar top-left
    this.temperatureIndicator.clear()
    const tempX = 8
    const tempY = 8
    const barW = 4
    const barH = 30

    // Background
    this.temperatureIndicator.fillStyle(0x333333, 0.5)
    this.temperatureIndicator.fillRoundedRect(tempX, tempY, barW, barH, 2)

    // Fill from bottom
    const tempFill = this.queen.bodyTemperature
    const fillH = barH * tempFill
    const tempColor = this.lerpColor(0x4488ff, 0xff6622, tempFill) // blue→orange
    this.temperatureIndicator.fillStyle(tempColor, 0.8)
    this.temperatureIndicator.fillRoundedRect(tempX, tempY + barH - fillH, barW, fillH, 2)

    // Energy: small belly icon top-left
    this.energyIndicator.clear()
    const eX = 18
    const eY = 12

    // Bee body outline
    this.energyIndicator.fillStyle(0x333333, 0.3)
    this.energyIndicator.fillEllipse(eX, eY, 12, 10)

    // Fill based on energy
    const energyFill = this.queen.energy
    const energyColor = this.lerpColor(0xff4444, 0xf5c542, energyFill)
    this.energyIndicator.fillStyle(energyColor, 0.7)
    this.energyIndicator.fillEllipse(eX, eY, 12 * energyFill, 10 * energyFill)

    // Vibrate hint pulse
    if (this.vibrateHintVisible) {
      const pulse = (Math.sin(this.time.now / 300) + 1) / 2
      this.vibrateHint.setAlpha(0.5 + pulse * 0.5)
      this.vibrateHint.setScale(1.3 + pulse * 0.2)
    }
  }

  private showVibrateHint() {
    if (this.hasShownVibrateHint) return
    this.hasShownVibrateHint = true
    this.vibrateHintVisible = true

    // Hide after queen warms up
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.queen.bodyTemperature > 0.5) {
          this.vibrateHintVisible = false
          this.tweens.add({
            targets: this.vibrateHint,
            alpha: 0,
            duration: 500,
          })
        }
      },
    })
  }

  // ── Input ───────────────────────────────────────

  private setupCamera() {
    this.cameras.main.startFollow(this.queen.sprite, true, 0.08, 0.08)
    this.cameras.main.setBounds(0, 0, SCENE_WIDTH * TILE_SIZE, SCENE_HEIGHT * TILE_SIZE)
    this.cameras.main.setZoom(2.5)
  }

  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys()
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      this.touchTarget = { x: worldPoint.x, y: worldPoint.y }
      this.tapCount++
    })

    this.input.on('pointerup', () => {
      this.touchTarget = null
      this.queen.stop()
    })
  }

  private handleInput() {
    if (this.isCollectingNectar) return

    // Keyboard
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

    // Touch
    if (this.touchTarget) {
      this.queen.moveTo(this.touchTarget.x, this.touchTarget.y)
      return
    }

    this.queen.stop()
  }

  private checkVibrationInput(delta: number) {
    // Rapid tapping = vibration to warm up
    this.tapTimer += delta

    if (this.tapTimer > 400) {
      // Reset if no taps in 400ms
      if (this.tapCount >= 3) {
        this.queen.startVibrating()
      }
      else {
        this.queen.stopVibrating()
      }
      this.tapCount = 0
      this.tapTimer = 0
    }
  }

  // ── Flower Interaction ──────────────────────────

  private checkFlowerProximity() {
    if (this.isCollectingNectar) return

    for (const flower of this.earlyFlowers) {
      if (!flower.hasNectar) continue

      const dist = Phaser.Math.Distance.Between(
        this.queen.sprite.x,
        this.queen.sprite.y,
        flower.x,
        flower.y,
      )

      // Glow when nearby
      if (dist < 30) {
        flower.sprite.setTint(0xffffff)
        flower.sprite.setScale(1.1 + Math.sin(this.time.now / 300) * 0.05)

        // Auto-collect when very close
        if (dist < 12) {
          this.collectFromFlower(flower)
        }
      }
      else {
        flower.sprite.clearTint()
        flower.sprite.setScale(1)
      }
    }
  }

  private collectFromFlower(flower: EarlyFlower) {
    this.isCollectingNectar = true
    this.collectTarget = flower
    this.queen.stop()

    // Collection animation
    this.tweens.add({
      targets: this.queen.sprite,
      x: flower.x,
      y: flower.y + 2,
      duration: 300,
      ease: 'Power1',
      onComplete: () => {
        // Nectar collecting — bee stays on flower briefly
        this.time.delayedCall(800, () => {
          flower.hasNectar = false
          flower.sprite.setAlpha(0.5) // flower is depleted

          // Nectar amount depends on flower type
          const amounts: Record<string, number> = {
            'crocus': 0.2,
            'snowdrop': 0.15,
            'willow-catkin': 0.25,
          }

          this.queen.collectNectar(amounts[flower.type] || 0.15)
          this.flowersVisited++

          // Small success feedback — flower petals scatter
          this.createPollenBurst(flower.x, flower.y)

          this.isCollectingNectar = false
          this.collectTarget = null
        })
      },
    })
  }

  private createPollenBurst(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const particle = this.add.circle(x, y, 1.5, 0xffee44, 0.8)
      particle.setDepth(DEPTH.ENTITY + 1)

      const angle = (Math.PI * 2 * i) / 6
      const dist = 8 + Math.random() * 6

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 4,
        alpha: 0,
        scale: 0.5,
        duration: 600,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      })
    }
  }

  // ── Animation ───────────────────────────────────

  private animateScene(_delta: number) {
    const time = this.time.now

    // Flowers sway
    for (const f of this.earlyFlowers) {
      f.sprite.setRotation(Math.sin(time / 900 + f.x) * 0.04)
    }
  }

  // ── Completion ──────────────────────────────────

  private completeChapter() {
    // Disable input
    this.input.removeAllListeners()

    // Queen flies upward joyfully
    this.tweens.add({
      targets: this.queen.sprite,
      y: this.queen.sprite.y - 30,
      duration: 1500,
      ease: 'Power1',
      onComplete: () => {
        // Fade and return to overworld
        this.cameras.main.fadeOut(1000, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.game.events.emit('task-complete', {
            taskId: 'bee-awakening',
            chapter: 1,
          })
          this.scene.start('CutsceneScene', createNestFoundCutscene())
        })
      },
    })
  }

  // ── Utils ───────────────────────────────────────

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
