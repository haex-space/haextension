import Phaser from 'phaser'

const QUEEN_MAX_SPEED = 60
const QUEEN_COLD_SPEED = 25
const ENERGY_DRAIN_RATE = 0.015 // per second when flying
const ENERGY_DRAIN_IDLE = 0.005 // per second when idle
const TEMP_DRAIN_RATE = 0.03 // per second, body cools down
const TEMP_GAIN_VIBRATE = 0.15 // per second while vibrating

export class BumblebeeQueen {
  sprite: Phaser.Physics.Arcade.Sprite
  shadow: Phaser.GameObjects.Ellipse

  private scene: Phaser.Scene

  // State
  energy = 0.4 // 0-1: queen starts with low reserves after winter
  bodyTemperature = 0.2 // 0-1: cold after hibernation
  pollenLoad = 0 // 0-1
  nectarLoad = 0 // 0-1
  isVibrating = false

  private originalTint = 0xf5c542
  private vibrateTimer = 0

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene

    // Generate queen texture — bumblebee: round, fuzzy, black with yellow bands + orange tail
    if (!scene.textures.exists('bee-queen')) {
      const gfx = scene.make.graphics({ x: 0, y: 0 })

      // Body — round and fat (bumblebees are chunky!)
      // Black base
      gfx.fillStyle(0x1a1a1a)
      gfx.fillEllipse(16, 16, 22, 18)

      // Yellow band — front thorax
      gfx.fillStyle(0xf0c830)
      gfx.fillRect(8, 10, 10, 4)
      // Fuzzy edge pixels
      gfx.fillStyle(0xd4b020, 0.6)
      gfx.fillRect(7, 11, 1, 2)
      gfx.fillRect(18, 11, 1, 2)

      // Yellow band — rear abdomen
      gfx.fillStyle(0xf0c830)
      gfx.fillRect(12, 18, 10, 3)
      gfx.fillStyle(0xd4b020, 0.6)
      gfx.fillRect(11, 19, 1, 1)
      gfx.fillRect(22, 19, 1, 1)

      // Orange-red tail (white-tailed bumblebee style → orange for visibility)
      gfx.fillStyle(0xe06030)
      gfx.fillEllipse(24, 18, 8, 10)
      gfx.fillStyle(0xcc5020, 0.5)
      gfx.fillEllipse(25, 17, 5, 6)

      // Head — black, round
      gfx.fillStyle(0x1a1a1a)
      gfx.fillCircle(5, 14, 5)

      // Eyes
      gfx.fillStyle(0x111111)
      gfx.fillCircle(3, 12, 1.5)

      // Antennae
      gfx.lineStyle(1, 0x2a2a2a)
      gfx.lineBetween(4, 10, 2, 5)
      gfx.lineBetween(6, 10, 5, 4)
      gfx.fillStyle(0x2a2a2a)
      gfx.fillCircle(2, 5, 1)
      gfx.fillCircle(5, 4, 1)

      // Wings (translucent, larger than honeybee relative to body)
      gfx.fillStyle(0xccccee, 0.4)
      gfx.fillEllipse(13, 7, 12, 7)
      gfx.fillEllipse(20, 8, 10, 6)

      // Legs
      gfx.lineStyle(1, 0x1a1a1a)
      gfx.lineBetween(12, 22, 10, 26)
      gfx.lineBetween(16, 22, 16, 27)
      gfx.lineBetween(20, 22, 22, 26)

      gfx.generateTexture('bee-queen', 32, 28)
      gfx.destroy()
    }

    // Pollen basket indicator (on hind legs)
    if (!scene.textures.exists('pollen-basket')) {
      const gfx = scene.make.graphics({ x: 0, y: 0 })
      gfx.fillStyle(0xffaa22)
      gfx.fillCircle(4, 4, 3)
      gfx.generateTexture('pollen-basket', 8, 8)
      gfx.destroy()
    }

    this.shadow = scene.add.ellipse(x, y + 14, 18, 7, 0x000000, 0.12)
    this.sprite = scene.physics.add.sprite(x, y, 'bee-queen')
    this.sprite.setOrigin(0.5, 0.8)
    this.sprite.setCollideWorldBounds(true)

    this.updateVisuals()
  }

  get speed(): number {
    // Speed depends on body temperature
    const tempFactor = this.bodyTemperature
    return QUEEN_COLD_SPEED + (QUEEN_MAX_SPEED - QUEEN_COLD_SPEED) * tempFactor
  }

  get isAlive(): boolean {
    return this.energy > 0
  }

  get isWarm(): boolean {
    return this.bodyTemperature > 0.5
  }

  update(delta: number) {
    const dt = delta / 1000
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const isMoving = body.velocity.length() > 5

    // Energy drain
    if (isMoving) {
      this.energy = Math.max(0, this.energy - ENERGY_DRAIN_RATE * dt)
    }
    else {
      this.energy = Math.max(0, this.energy - ENERGY_DRAIN_IDLE * dt)
    }

    // Temperature naturally drops
    if (!this.isVibrating) {
      this.bodyTemperature = Math.max(0, this.bodyTemperature - TEMP_DRAIN_RATE * dt)
    }

    // Vibrating warms up
    if (this.isVibrating) {
      this.bodyTemperature = Math.min(1, this.bodyTemperature + TEMP_GAIN_VIBRATE * dt)
      this.energy = Math.max(0, this.energy - ENERGY_DRAIN_RATE * 0.5 * dt)

      // Visual vibration
      this.vibrateTimer += delta
      this.sprite.x += Math.sin(this.vibrateTimer * 0.05) * 0.3
    }

    // Shadow follows
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 14)

    this.updateVisuals()
  }

  startVibrating() {
    this.isVibrating = true
    this.vibrateTimer = 0
  }

  stopVibrating() {
    this.isVibrating = false
  }

  collectNectar(amount: number) {
    this.nectarLoad = Math.min(1, this.nectarLoad + amount)
    this.energy = Math.min(1, this.energy + amount * 0.7) // Nectar is the main energy source
  }

  collectPollen(amount: number) {
    this.pollenLoad = Math.min(1, this.pollenLoad + amount)
  }

  moveTo(targetX: number, targetY: number) {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const dx = targetX - this.sprite.x
    const dy = targetY - this.sprite.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 4) {
      body.setVelocity(0, 0)
      return true // arrived
    }

    const currentSpeed = this.speed
    body.setVelocity(
      (dx / distance) * currentSpeed,
      (dy / distance) * currentSpeed,
    )

    if (dx < 0) this.sprite.setFlipX(false) // bee faces left by default
    else if (dx > 0) this.sprite.setFlipX(true)

    return false
  }

  stop() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0, 0)
  }

  setDepth(depth: number) {
    this.sprite.setDepth(depth)
    this.shadow.setDepth(depth - 0.1)
  }

  destroy() {
    this.sprite.destroy()
    this.shadow.destroy()
  }

  private updateVisuals() {
    // Body brightness reflects temperature (cold = dark/dull, warm = normal)
    const warmth = this.bodyTemperature
    const brightness = 0.5 + warmth * 0.5
    const r = Math.round(0xff * brightness)
    const g = Math.round(0xff * brightness)
    const b = Math.round(0xff * brightness)
    this.sprite.setTint((r << 16) | (g << 8) | b)

    // Scale reflects energy (queen gets visibly thinner when hungry)
    const scaleY = 0.85 + this.energy * 0.15
    this.sprite.setScale(1, scaleY)
  }
}
