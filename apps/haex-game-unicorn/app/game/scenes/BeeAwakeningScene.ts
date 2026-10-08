import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { BumblebeeQueen } from '../entities/BumblebeeQueen'
import { createNestFoundCutscene } from './cutscene/nestFound'
import { lerpColor } from '../utils/color'
import { DEPTH, SCENE_HEIGHT, SCENE_WIDTH, TILE_SIZE } from './bee-awakening/constants'
import type { EarlyFlower } from './bee-awakening/constants'
import { createEarlySpringFlowers, createEmergencePoint, createGround } from './bee-awakening/world'

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
  private isCompleting = false

  constructor() {
    super({ key: 'BeeAwakeningScene' })
  }

  create() {
    this.rng = new Phaser.Math.RandomDataGenerator(['awakening-v1'])
    // Phaser reuses the scene instance, so a replay must start from a clean state
    this.touchTarget = null
    this.earlyFlowers = []
    this.vibrateHintVisible = false
    this.isCollectingNectar = false
    this.collectTarget = null
    this.flowersVisited = 0
    this.hasShownVibrateHint = false
    this.tapCount = 0
    this.tapTimer = 0
    this.isCompleting = false

    createGround(this, this.rng)
    this.earlyFlowers.push(...createEarlySpringFlowers(this, this.rng))
    createEmergencePoint(this)
    this.createQueen()
    this.createUI()
    this.setupCamera()
    this.setupInput()

    // Entrance animation: queen crawls out of earth
    this.playEmergenceAnimation()
  }

  override update(_time: number, delta: number) {
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
    if (this.flowersVisited >= 3 && this.queen.energy > 0.45) {
      this.completeChapter()
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
    // Back button — top-right, arrow pointing left with unicorn hint
    this.createBackButton()

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
    const tempColor = lerpColor(0x4488ff, 0xff6622, tempFill) // blue→orange
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
    const energyColor = lerpColor(0xff4444, 0xf5c542, energyFill)
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
    // update() keeps calling this while the win condition holds
    if (this.isCompleting) return
    this.isCompleting = true

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

  // ── Navigation ──────────────────────────────────

  private createBackButton() {
    const btn = this.add.graphics()
    btn.setScrollFactor(0)
    btn.setDepth(DEPTH.UI)

    // Circular button with left arrow
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
}
