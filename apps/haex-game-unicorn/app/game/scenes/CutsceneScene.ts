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

/**
 * Creates the queen emergence cutscene (Overworld → Chapter 1 transition)
 */
export function createQueenEmergenceCutscene(): CutsceneConfig {
  return {
    bgColor: 0x2a3a1a,
    nextScene: 'BeeAwakeningScene',
    completeEvent: 'cutscene-complete',
    completeEventData: { id: 'queen-emergence' },
    frames: [
      // Frame 1: Snowy ground, earth
      {
        holdDuration: 2000,
        build(scene, container) {
          // Frozen earth background
          const earth = scene.add.graphics()
          earth.fillStyle(0x5a4a3a)
          earth.fillEllipse(0, 20, 120, 50)
          earth.fillStyle(0x8aaa7a, 0.3)
          earth.fillRect(-40, -10, 80, 4) // frost line
          container.add(earth)

          // Small underground chamber
          earth.fillStyle(0x3a2a1a)
          earth.fillEllipse(0, 30, 40, 20)

          // Sleeping queen inside (curled up)
          const sleepQueen = scene.add.graphics()
          sleepQueen.fillStyle(0xb89530, 0.7)
          sleepQueen.fillEllipse(0, 32, 16, 10)
          sleepQueen.fillStyle(0x2a1a0a, 0.7)
          sleepQueen.fillRect(-4, 30, 8, 2)
          container.add(sleepQueen)

          // Snow particles on top
          for (let i = 0; i < 12; i++) {
            const snowflake = scene.add.circle(
              (Math.random() - 0.5) * 100,
              -30 + Math.random() * 20,
              1 + Math.random(),
              0xffffff,
              0.6,
            )
            container.add(snowflake)
          }
        },
      },
      // Frame 2: Spring warmth melts snow, queen stirs
      {
        holdDuration: 2000,
        build(scene, container) {
          // Warmer earth
          const earth = scene.add.graphics()
          earth.fillStyle(0x6a5a3a)
          earth.fillEllipse(0, 20, 120, 50)
          container.add(earth)

          // Chamber
          earth.fillStyle(0x3a2a1a)
          earth.fillEllipse(0, 30, 40, 20)

          // Queen uncurling
          const queen = scene.add.graphics()
          queen.fillStyle(0xd4a830)
          queen.fillEllipse(0, 28, 18, 12)
          // Stripes
          queen.fillStyle(0x3a2a1a)
          queen.fillRect(-6, 26, 12, 2)
          queen.fillRect(-6, 30, 12, 2)
          // Head
          queen.fillStyle(0x3a2a1a)
          queen.fillCircle(-10, 26, 4)
          container.add(queen)

          // Wiggle animation
          scene.tweens.add({
            targets: queen,
            x: 2,
            duration: 300,
            yoyo: true,
            repeat: 3,
          })

          // Sun rays from top
          const rays = scene.add.graphics()
          rays.fillStyle(0xffee88, 0.15)
          rays.fillTriangle(-20, -60, -5, 10, 5, 10)
          rays.fillTriangle(10, -60, 15, 10, 25, 10)
          container.add(rays)
        },
      },
      // Frame 3: Queen emerges from earth
      {
        holdDuration: 2500,
        build(scene, container) {
          // Ground level
          const ground = scene.add.graphics()
          ground.fillStyle(0x5a8f3d)
          ground.fillRect(-80, 10, 160, 60)
          ground.fillStyle(0x6a5a3a)
          ground.fillEllipse(0, 10, 30, 16)
          container.add(ground)

          // Queen climbing out
          const queen = scene.add.graphics()
          queen.fillStyle(0xf5c542)
          queen.fillEllipse(0, 0, 20, 14)
          queen.fillStyle(0x3a2a1a)
          queen.fillRect(-7, -2, 14, 2)
          queen.fillRect(-7, 2, 14, 2)
          queen.fillStyle(0x3a2a1a)
          queen.fillCircle(-12, -2, 5)
          queen.fillStyle(0x111111)
          queen.fillCircle(-14, -4, 1.5)
          // Wings
          queen.fillStyle(0xddddff, 0.4)
          queen.fillEllipse(-2, -8, 12, 7)
          queen.fillEllipse(4, -7, 10, 6)
          container.add(queen)

          // Queen rises from hole
          queen.setPosition(0, 20)
          scene.tweens.add({
            targets: queen,
            y: -5,
            duration: 2000,
            ease: 'Power2',
          })

          // Tiny crocus nearby
          const crocus = scene.add.graphics()
          crocus.fillStyle(0x3a6a28)
          crocus.fillRect(35, 8, 2, 8)
          crocus.fillStyle(0xbb77ff)
          crocus.fillEllipse(36, 5, 6, 8)
          container.add(crocus)
        },
      },
      // Frame 4: Queen sees the spring meadow
      {
        holdDuration: 2000,
        build(scene, container) {
          // Wide spring meadow
          const sky = scene.add.graphics()
          sky.fillStyle(0x87ceeb)
          sky.fillRect(-120, -80, 240, 100)
          sky.fillStyle(0x5a8f3d)
          sky.fillRect(-120, 20, 240, 60)
          container.add(sky)

          // Scattered early flowers
          const flowerColors = [0xbb77ff, 0xffffff, 0xffdd44]
          for (let i = 0; i < 8; i++) {
            const fx = (Math.random() - 0.5) * 200
            const fy = 25 + Math.random() * 30
            const flower = scene.add.graphics()
            flower.fillStyle(0x3a6a28)
            flower.fillRect(fx, fy, 1, 5)
            flower.fillStyle(flowerColors[i % flowerColors.length])
            flower.fillCircle(fx, fy - 2, 3)
            container.add(flower)
          }

          // Queen in foreground, looking out
          const queen = scene.add.graphics()
          queen.fillStyle(0xf5c542)
          queen.fillEllipse(-40, 30, 24, 16)
          queen.fillStyle(0x3a2a1a)
          queen.fillRect(-49, 28, 16, 2)
          queen.fillRect(-49, 32, 16, 2)
          queen.fillCircle(-54, 26, 6)
          queen.fillStyle(0x111111)
          queen.fillCircle(-56, 24, 2)
          // Wings
          queen.fillStyle(0xddddff, 0.4)
          queen.fillEllipse(-42, 22, 14, 8)
          container.add(queen)

          // Sun
          const sun = scene.add.circle(80, -50, 18, 0xffdd44, 0.6)
          container.add(sun)
          scene.tweens.add({
            targets: sun,
            alpha: 0.8,
            duration: 1500,
            yoyo: true,
            repeat: -1,
          })
        },
      },
    ],
  }
}

/**
 * Creates the nest-found cutscene (Chapter 1 → Chapter 2 transition)
 */
export function createNestFoundCutscene(): CutsceneConfig {
  return {
    bgColor: 0x2a3a1a,
    nextScene: 'NestSearchScene',
    frames: [
      // Frame 1: Queen is energized, ready to search
      {
        holdDuration: 2000,
        build(scene, container) {
          // Sky + ground
          const bg = scene.add.graphics()
          bg.fillStyle(0x87ceeb)
          bg.fillRect(-120, -80, 240, 100)
          bg.fillStyle(0x5a8f3d)
          bg.fillRect(-120, 20, 240, 60)
          container.add(bg)

          // Queen flying energetically
          const queen = scene.add.graphics()
          queen.fillStyle(0xf5c542)
          queen.fillEllipse(0, 0, 22, 14)
          queen.fillStyle(0x3a2a1a)
          queen.fillRect(-8, -2, 16, 2)
          queen.fillRect(-8, 2, 16, 2)
          queen.fillCircle(-13, -2, 5)
          queen.fillStyle(0xddddff, 0.5)
          queen.fillEllipse(-2, -8, 14, 8)
          container.add(queen)

          // Flight trail
          scene.tweens.add({
            targets: queen,
            x: { from: -60, to: 60 },
            y: { from: 10, to: -10 },
            duration: 2500,
            ease: 'Sine.easeInOut',
          })

          // Small question marks / search visual
          for (let i = 0; i < 3; i++) {
            const searchDot = scene.add.circle(
              -30 + i * 30,
              30 + Math.sin(i) * 10,
              4,
              0xffee88,
              0.3,
            )
            container.add(searchDot)
            scene.tweens.add({
              targets: searchDot,
              alpha: 0.6,
              duration: 600,
              delay: i * 300,
              yoyo: true,
              repeat: -1,
            })
          }
        },
      },
      // Frame 2: Ground-level view, showing possible spots
      {
        holdDuration: 2500,
        build(scene, container) {
          const bg = scene.add.graphics()
          bg.fillStyle(0x5a8f3d)
          bg.fillRect(-120, -10, 240, 90)
          bg.fillStyle(0x87ceeb)
          bg.fillRect(-120, -80, 240, 70)
          container.add(bg)

          // Various potential nest sites
          // Mouse hole
          const hole = scene.add.graphics()
          hole.fillStyle(0x6a5a3a)
          hole.fillEllipse(-60, 20, 20, 12)
          hole.fillStyle(0x1a0a00)
          hole.fillCircle(-60, 22, 4)
          container.add(hole)

          // Grass tuft
          const tuft = scene.add.graphics()
          tuft.fillStyle(0x4a8f3d)
          tuft.fillTriangle(0, 20, -4, 2, 4, 20)
          tuft.fillTriangle(6, 20, 2, 0, 10, 20)
          container.add(tuft)

          // Tree root
          const root = scene.add.graphics()
          root.fillStyle(0x6b4423)
          root.fillRect(55, -10, 6, 30)
          root.lineStyle(2, 0x5a3818)
          root.lineBetween(55, 18, 42, 28)
          root.lineBetween(61, 18, 72, 26)
          container.add(root)

          // Queen flying low, scanning
          const queen = scene.add.graphics()
          queen.fillStyle(0xf5c542)
          queen.fillEllipse(0, -15, 18, 12)
          queen.fillStyle(0x3a2a1a)
          queen.fillCircle(-10, -17, 4)
          // Down-looking antennae
          queen.lineStyle(1, 0x3a2a1a)
          queen.lineBetween(-12, -14, -14, -10)
          queen.lineBetween(-10, -14, -9, -10)
          container.add(queen)

          scene.tweens.add({
            targets: queen,
            x: { from: -80, to: 80 },
            duration: 3000,
            ease: 'Linear',
          })
        },
      },
    ],
  }
}
