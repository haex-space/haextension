import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'

/**
 * A cutscene frame drawn procedurally.
 * Each frame is a function that creates visuals on the scene
 * and returns a cleanup function.
 */
export interface CutsceneFrameDef {
  /** Build the frame's visuals. Return a destroy/cleanup function. */
  build: (scene: Phaser.Scene, container: Phaser.GameObjects.Container) => void
  /** Duration in ms before "tap to continue" hint appears */
  holdDuration?: number
}

export interface CutsceneConfig {
  frames: CutsceneFrameDef[]
  /** Background color for the cutscene */
  bgColor?: number
  /** Scene to start after cutscene completes */
  nextScene: string
  /** Data to pass to the next scene */
  nextSceneData?: Record<string, unknown>
  /** Event to emit on completion */
  completeEvent?: string
  completeEventData?: Record<string, unknown>
}

const TAP_HINT_DELAY = 1500

export class CutsceneScene extends Phaser.Scene {
  private config!: CutsceneConfig
  private currentFrame = 0
  private container!: Phaser.GameObjects.Container
  private tapHint!: Phaser.GameObjects.Container
  private canAdvance = false
  private transitioning = false

  // Visual elements
  private bg!: Phaser.GameObjects.Rectangle
  private progressDots: Phaser.GameObjects.Arc[] = []
  private vignetteOverlay!: Phaser.GameObjects.Graphics

  constructor() {
    super({ key: 'CutsceneScene' })
  }

  init(data: CutsceneConfig) {
    this.config = data
    this.currentFrame = 0
    this.canAdvance = false
    this.transitioning = false
  }

  create() {
    // Background
    const bgColor = this.config.bgColor ?? 0x1a1a2e
    this.bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, bgColor)
    this.bg.setDepth(0)

    // Vignette for cinematic feel
    this.vignetteOverlay = this.add.graphics()
    this.vignetteOverlay.setDepth(90)
    this.drawVignette()

    // Frame container — all frame content goes here for easy cleanup
    this.container = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
    this.container.setDepth(10)

    // Progress dots (bottom center)
    this.createProgressDots()

    // "Tap to continue" hint
    this.createTapHint()

    // Input
    this.input.on('pointerdown', () => this.advance())
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-SPACE', () => this.advance())
      this.input.keyboard.on('keydown-ENTER', () => this.advance())
    }

    // Start first frame
    this.cameras.main.fadeIn(500, 0, 0, 0)
    this.showFrame(0)
  }

  // ── Frame Management ────────────────────────────

  private showFrame(index: number) {
    this.currentFrame = index
    this.canAdvance = false
    this.tapHint.setAlpha(0)

    // Clear previous frame content
    this.container.removeAll(true)

    // Build new frame
    const frameDef = this.config.frames[index]
    if (!frameDef) return
    frameDef.build(this, this.container)

    // Fade in
    this.container.setAlpha(0)
    this.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 400,
      ease: 'Power1',
    })

    // Update progress dots
    this.updateProgressDots()

    // Enable advancing after hold duration
    const holdMs = frameDef.holdDuration ?? TAP_HINT_DELAY
    this.time.delayedCall(holdMs, () => {
      this.canAdvance = true
      this.showTapHint()
    })
  }

  private advance() {
    if (!this.canAdvance || this.transitioning) return

    if (this.currentFrame < this.config.frames.length - 1) {
      // Fade out current, show next
      this.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 300,
        onComplete: () => this.showFrame(this.currentFrame + 1),
      })
    }
    else {
      // Cutscene complete
      this.completeCutscene()
    }
  }

  private completeCutscene() {
    this.transitioning = true

    this.cameras.main.fadeOut(600, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.config.completeEvent) {
        this.game.events.emit(this.config.completeEvent, this.config.completeEventData ?? {})
      }
      this.scene.start(this.config.nextScene, this.config.nextSceneData)
    })
  }

  // ── UI Elements ─────────────────────────────────

  private createProgressDots() {
    const totalFrames = this.config.frames.length
    if (totalFrames <= 1) return

    const dotSpacing = 10
    const startX = GAME_WIDTH / 2 - ((totalFrames - 1) * dotSpacing) / 2
    const y = GAME_HEIGHT - 16

    for (let i = 0; i < totalFrames; i++) {
      const dot = this.add.circle(startX + i * dotSpacing, y, 3, 0xffffff, 0.3)
      dot.setDepth(95)
      this.progressDots.push(dot)
    }
  }

  private updateProgressDots() {
    for (let i = 0; i < this.progressDots.length; i++) {
      const isActive = i === this.currentFrame
      const isPast = i < this.currentFrame

      this.tweens.add({
        targets: this.progressDots[i],
        alpha: isActive ? 0.9 : isPast ? 0.6 : 0.3,
        scaleX: isActive ? 1.3 : 1,
        scaleY: isActive ? 1.3 : 1,
        duration: 200,
      })
    }
  }

  private createTapHint() {
    this.tapHint = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 32)
    this.tapHint.setDepth(95)
    this.tapHint.setAlpha(0)

    // Small hand/tap icon
    const tapCircle = this.add.circle(0, 0, 6, 0xffffff, 0.6)
    const tapRing = this.add.circle(0, 0, 10, 0xffffff, 0)
    tapRing.setStrokeStyle(1, 0xffffff, 0.4)

    this.tapHint.add([tapCircle, tapRing])

    // Pulse animation for the ring
    this.tweens.add({
      targets: tapRing,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 1000,
      repeat: -1,
    })
  }

  private showTapHint() {
    this.tweens.add({
      targets: this.tapHint,
      alpha: 1,
      duration: 400,
    })
  }

  private drawVignette() {
    this.vignetteOverlay.clear()

    // Soft dark border around edges
    const w = GAME_WIDTH
    const h = GAME_HEIGHT
    const gradient = this.vignetteOverlay

    // Top and bottom bars (subtle)
    gradient.fillStyle(0x000000, 0.3)
    gradient.fillRect(0, 0, w, 8)
    gradient.fillRect(0, h - 8, w, 8)

    gradient.fillStyle(0x000000, 0.15)
    gradient.fillRect(0, 8, w, 6)
    gradient.fillRect(0, h - 14, w, 6)
  }
}

// ── Predefined Cutscene Builders ──────────────────

/**
 * Helper to create a cutscene frame that shows a centered sprite
 * with optional label animation below.
 */
export function createSpriteFrame(
  textureKey: string,
  setupFn?: (scene: Phaser.Scene) => void,
  scale = 2,
  holdDuration = TAP_HINT_DELAY,
): CutsceneFrameDef {
  return {
    holdDuration,
    build(scene, container) {
      if (setupFn) setupFn(scene)

      const sprite = scene.add.sprite(0, -10, textureKey)
      sprite.setScale(scale)
      container.add(sprite)

      // Gentle float animation
      scene.tweens.add({
        targets: sprite,
        y: -14,
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    },
  }
}
