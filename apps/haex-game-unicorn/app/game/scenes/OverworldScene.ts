import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { SeasonSystem } from '../systems/SeasonSystem'
import { WeatherSystem } from '../systems/WeatherSystem'
import { AudioSystem } from '../systems/AudioSystem'
import { createQueenEmergenceCutscene } from './CutsceneScene'

const TILE_SIZE = 16
const MAP_WIDTH = 60
const MAP_HEIGHT = 40
const UNICORN_SPEED = 80

// Depth layers
const DEPTH = {
  SKY: 0,
  MOUNTAINS: 1,
  FAR_TREES: 2,
  GROUND: 3,
  GROUND_DETAIL: 4,
  FLOWERS: 5,
  NEST: 6,
  ENTITIES: 10,
  TREE_TRUNK: 11,
  TREE_FOLIAGE: 50,
  WEATHER: 100,
}

interface WorldTree {
  trunk: Phaser.GameObjects.Sprite
  foliage: Phaser.GameObjects.Sprite
  x: number
  y: number
  swayOffset: number
}

interface WorldFlower {
  sprite: Phaser.GameObjects.Sprite
  x: number
  y: number
  swayOffset: number
  type: string
}

interface AmbientCreature {
  sprite: Phaser.GameObjects.Sprite
  vx: number
  vy: number
  lifetime: number
  type: 'butterfly' | 'ladybug'
}

export class OverworldScene extends Phaser.Scene {
  private unicorn!: Phaser.Physics.Arcade.Sprite
  private unicornShadow!: Phaser.GameObjects.Ellipse
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private touchTarget: { x: number, y: number } | null = null

  private trees: WorldTree[] = []
  private flowers: WorldFlower[] = []
  private grassDetails: Phaser.GameObjects.Sprite[] = []
  private ambientCreatures: AmbientCreature[] = []

  private bumblebeeNest: Phaser.GameObjects.Sprite | null = null
  private nestGlow: Phaser.GameObjects.Ellipse | null = null

  // Parallax layers
  private skyGradient!: Phaser.GameObjects.Graphics
  private mountainLayer!: Phaser.GameObjects.TileSprite
  private farTreeLayer!: Phaser.GameObjects.TileSprite
  private clouds: Phaser.GameObjects.Sprite[] = []

  // Systems
  private seasonSystem!: SeasonSystem
  private weatherSystem!: WeatherSystem
  private audioSystem!: AudioSystem
  private weatherGfx!: Phaser.GameObjects.Graphics
  private audioInitialized = false

  // Ambient
  private lastCreatureSpawn = 0

  private rng!: Phaser.Math.RandomDataGenerator

  constructor() {
    super({ key: 'OverworldScene' })
  }

  create() {
    this.rng = new Phaser.Math.RandomDataGenerator(['meadow-world-v2'])

    this.seasonSystem = new SeasonSystem(this)
    this.weatherSystem = new WeatherSystem(this)
    this.audioSystem = new AudioSystem(this)

    this.createSky()
    this.createParallaxLayers()
    this.createGround()
    this.createGrassDetails()
    this.createTrees()
    this.createFlowers()
    this.createBumblebeeNest()
    this.createUnicorn()
    this.createWeatherLayer()
    this.setupCamera()
    this.setupInput()

    this.emitEvent('scene-ready', { scene: 'OverworldScene' })
  }

  update(_time: number, delta: number) {
    this.seasonSystem.update(delta)
    this.updateParallax()
    this.updateWeather(delta)
    this.handleMovement()
    this.animateWorld(delta)
    this.updateAmbientCreatures(delta)
    this.updateUnicornDepth()
    this.updateNestGlow()
  }

  // ── Sky & Parallax ──────────────────────────────

  private createSky() {
    this.skyGradient = this.add.graphics()
    this.skyGradient.setScrollFactor(0)
    this.skyGradient.setDepth(DEPTH.SKY)
    this.drawSky()
  }

  private drawSky() {
    const palette = this.seasonSystem.palette
    this.skyGradient.clear()

    const w = this.cameras.main.width
    const h = this.cameras.main.height

    // Gradient sky
    const steps = 16
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const color = this.lerpColor(palette.sky, palette.skyBottom, t)
      this.skyGradient.fillStyle(color, 1)
      const yStart = (h / steps) * i
      const yHeight = h / steps + 1
      this.skyGradient.fillRect(0, yStart, w, yHeight)
    }
  }

  private createParallaxLayers() {
    this.mountainLayer = this.add.tileSprite(this.cameras.main.width / 2, 20, this.cameras.main.width, 64, 'mountains-tex')
    this.mountainLayer.setScrollFactor(0)
    this.mountainLayer.setDepth(DEPTH.MOUNTAINS)
    this.mountainLayer.setOrigin(0.5, 0)

    this.farTreeLayer = this.add.tileSprite(this.cameras.main.width / 2, 52, this.cameras.main.width, 40, 'far-trees-tex')
    this.farTreeLayer.setScrollFactor(0)
    this.farTreeLayer.setDepth(DEPTH.FAR_TREES)
    this.farTreeLayer.setOrigin(0.5, 0)

    // Clouds
    this.createClouds()
  }

  private createClouds() {
    for (let i = 0; i < 5; i++) {
      const cloud = this.add.sprite(
        this.rng.between(-40, GAME_WIDTH + 40),
        this.rng.between(5, 35),
        'cloud',
      )
      cloud.setScrollFactor(0)
      cloud.setDepth(DEPTH.MOUNTAINS + 0.5)
      cloud.setAlpha(0.3 + this.rng.frac() * 0.4)
      cloud.setScale(0.6 + this.rng.frac() * 0.8)
      cloud.setData('speed', 3 + this.rng.frac() * 5)
      this.clouds.push(cloud)
    }
  }

  private updateParallax() {
    const cam = this.cameras.main
    const scrollX = cam.scrollX
    const scrollY = cam.scrollY

    // Resize parallax layers to fill camera
    const camW = cam.width
    this.mountainLayer.width = camW
    this.mountainLayer.x = camW / 2
    this.farTreeLayer.width = camW
    this.farTreeLayer.x = camW / 2

    // Parallax scroll — distant layers move slower
    this.mountainLayer.tilePositionX = scrollX * 0.05
    this.mountainLayer.y = Math.max(0, 10 - scrollY * 0.03)
    this.farTreeLayer.tilePositionX = scrollX * 0.1
    this.farTreeLayer.y = Math.max(30, 50 - scrollY * 0.05)

    // Cloud drift
    for (const cloud of this.clouds) {
      cloud.x += cloud.getData('speed') as number * 0.005
      if (cloud.x > cam.width + 50) {
        cloud.x = -50
        cloud.y = this.rng.between(5, 35)
      }
    }

    this.drawSky()
  }

  // ── Ground & Vegetation ─────────────────────────

  private createGround() {
    for (let x = 0; x < MAP_WIDTH; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const grass = this.add.sprite(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 'grass')
        grass.setDepth(DEPTH.GROUND)

        // Natural color variation
        const variation = this.rng.frac()
        if (variation > 0.85) {
          grass.setTint(0x4a8f3d) // darker
        }
        else if (variation > 0.7) {
          grass.setTint(0x6a9f4d) // lighter
        }
      }
    }

    this.physics.world.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
  }

  private createGrassDetails() {
    for (let i = 0; i < 80; i++) {
      const x = this.rng.between(TILE_SIZE, MAP_WIDTH * TILE_SIZE - TILE_SIZE)
      const y = this.rng.between(TILE_SIZE, MAP_HEIGHT * TILE_SIZE - TILE_SIZE)
      const detail = this.add.sprite(x, y, 'tall-grass')
      detail.setDepth(DEPTH.GROUND_DETAIL)
      detail.setAlpha(0.7 + this.rng.frac() * 0.3)
      this.grassDetails.push(detail)
    }
  }

  private createTrees() {
    for (let i = 0; i < 18; i++) {
      const x = this.rng.between(TILE_SIZE * 4, MAP_WIDTH * TILE_SIZE - TILE_SIZE * 4)
      const y = this.rng.between(TILE_SIZE * 4, MAP_HEIGHT * TILE_SIZE - TILE_SIZE * 4)

      const trunk = this.add.sprite(x, y, 'tree-trunk')
      trunk.setDepth(DEPTH.TREE_TRUNK)
      trunk.setOrigin(0.5, 0.9)

      const foliage = this.add.sprite(x, y - 26, 'tree-foliage')
      foliage.setDepth(DEPTH.TREE_FOLIAGE + y) // sort by Y for overlap
      foliage.setOrigin(0.5, 0.7)

      this.trees.push({
        trunk,
        foliage,
        x,
        y,
        swayOffset: this.rng.frac() * Math.PI * 2,
      })
    }
  }

  private createFlowers() {
    const flowerTypes = [
      { key: 'flower-pink' },
      { key: 'flower-blue' },
      { key: 'flower-yellow' },
      { key: 'flower-white' },
      { key: 'flower-purple' },
    ]

    for (let i = 0; i < 50; i++) {
      const x = this.rng.between(TILE_SIZE * 2, MAP_WIDTH * TILE_SIZE - TILE_SIZE * 2)
      const y = this.rng.between(TILE_SIZE * 2, MAP_HEIGHT * TILE_SIZE - TILE_SIZE * 2)
      const type = flowerTypes[this.rng.between(0, flowerTypes.length - 1)]

      const flower = this.add.sprite(x, y, type.key)
      flower.setDepth(DEPTH.FLOWERS)

      this.flowers.push({
        sprite: flower,
        x,
        y,
        swayOffset: this.rng.frac() * Math.PI * 2,
        type: type.key,
      })
    }
  }

  private createBumblebeeNest() {
    const nestX = (MAP_WIDTH * TILE_SIZE) / 2 + 100
    const nestY = (MAP_HEIGHT * TILE_SIZE) / 2 - 60

    // Subtle glow to draw attention
    this.nestGlow = this.add.ellipse(nestX, nestY + 2, 40, 24, 0xffee88, 0)
    this.nestGlow.setDepth(DEPTH.NEST - 0.1)

    this.bumblebeeNest = this.add.sprite(nestX, nestY, 'bumblebee-nest')
    this.bumblebeeNest.setDepth(DEPTH.NEST)
    this.bumblebeeNest.setInteractive({ useHandCursor: true })

    this.bumblebeeNest.on('pointerdown', () => {
      this.startNestInteraction()
    })
  }

  private startNestInteraction() {
    // Distance check — unicorn must be close
    const dist = Phaser.Math.Distance.Between(
      this.unicorn.x,
      this.unicorn.y,
      this.bumblebeeNest!.x,
      this.bumblebeeNest!.y,
    )

    if (dist > 60) {
      // Walk unicorn toward nest first
      this.touchTarget = {
        x: this.bumblebeeNest!.x - 20,
        y: this.bumblebeeNest!.y + 10,
      }
      return
    }

    this.emitEvent('nest-interact', { nestType: 'bumblebee' })

    // Start cutscene transition to Chapter 1
    this.cameras.main.fadeOut(600, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CutsceneScene', createQueenEmergenceCutscene())
    })
  }

  // ── Unicorn ─────────────────────────────────────

  private createUnicorn() {
    const startX = (MAP_WIDTH * TILE_SIZE) / 2
    const startY = (MAP_HEIGHT * TILE_SIZE) / 2

    // Shadow
    this.unicornShadow = this.add.ellipse(startX, startY + 12, 20, 8, 0x000000, 0.15)
    this.unicornShadow.setDepth(DEPTH.ENTITIES - 0.1)

    this.unicorn = this.physics.add.sprite(startX, startY, 'unicorn', 0)
    this.unicorn.setCollideWorldBounds(true)
    this.unicorn.setDepth(DEPTH.ENTITIES)
    this.unicorn.setOrigin(0.5, 0.8)
    // Scale down: spritesheet frames are 250x211, we want ~32px wide in-game
    this.unicorn.setScale(0.14)
    this.unicorn.play('unicorn-idle')
  }

  private updateUnicornDepth() {
    // Depth sort: entities lower on screen appear in front
    this.unicorn.setDepth(DEPTH.ENTITIES + this.unicorn.y)
    this.unicornShadow.setPosition(this.unicorn.x, this.unicorn.y + 12)
  }

  // ── Weather ─────────────────────────────────────

  private createWeatherLayer() {
    this.weatherGfx = this.add.graphics()
    this.weatherGfx.setDepth(DEPTH.WEATHER)
  }

  private updateWeather(delta: number) {
    const cam = this.cameras.main
    this.weatherSystem.update(
      delta,
      this.seasonSystem.season,
      cam.scrollX,
      cam.scrollY,
      cam.width / cam.zoom,
      cam.height / cam.zoom,
    )
    this.weatherSystem.draw(this.weatherGfx)
  }

  // ── Camera ──────────────────────────────────────

  private setupCamera() {
    this.cameras.main.startFollow(this.unicorn, true, 0.08, 0.08)
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
    this.cameras.main.setZoom(2)
  }

  // ── Input ───────────────────────────────────────

  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys()
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Init audio on first user gesture (Web Audio requirement)
      if (!this.audioInitialized) {
        this.audioSystem.init()
        this.audioSystem.setSeason(this.seasonSystem.season)
        this.audioInitialized = true
      }

      // Ignore if an interactive object handled it
      if (pointer.downElement !== this.game.canvas) return

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      this.touchTarget = { x: worldPoint.x, y: worldPoint.y }
    })

    this.input.on('pointerup', () => {
      this.touchTarget = null
      this.unicorn.setVelocity(0, 0)
    })
  }

  private playWalkAnim(vx: number, vy: number) {
    // Pick animation based on dominant direction
    const absX = Math.abs(vx)
    const absY = Math.abs(vy)

    let anim: string
    if (absX > absY) {
      anim = vx < 0 ? 'unicorn-walk-left' : 'unicorn-walk-right'
      // Flip sprite horizontally for left-walking
      this.unicorn.setFlipX(vx < 0)
    }
    else {
      anim = vy < 0 ? 'unicorn-walk-up' : 'unicorn-walk-down'
      this.unicorn.setFlipX(false)
    }

    if (this.unicorn.anims.currentAnim?.key !== anim) {
      this.unicorn.play(anim, true)
    }
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

        if (vx !== 0 && vy !== 0) {
          vx *= Math.SQRT1_2
          vy *= Math.SQRT1_2
        }

        body.setVelocity(vx, vy)
        this.playWalkAnim(vx, vy)

        return
      }
    }

    // Touch movement
    if (this.touchTarget) {
      const dx = this.touchTarget.x - this.unicorn.x
      const dy = this.touchTarget.y - this.unicorn.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 4) {
        body.setVelocity(0, 0)
        this.touchTarget = null
        this.unicorn.play('unicorn-idle', true)
        return
      }

      const vx = (dx / distance) * UNICORN_SPEED
      const vy = (dy / distance) * UNICORN_SPEED
      body.setVelocity(vx, vy)
      this.playWalkAnim(vx, vy)

      return
    }

    body.setVelocity(0, 0)
    if (this.unicorn.anims.currentAnim?.key !== 'unicorn-idle') {
      this.unicorn.play('unicorn-idle', true)
    }
  }

  // ── Ambient Creatures ───────────────────────────

  private updateAmbientCreatures(delta: number) {
    const cam = this.cameras.main
    const cx = cam.scrollX
    const cy = cam.scrollY
    const cw = cam.width / cam.zoom
    const ch = cam.height / cam.zoom

    this.lastCreatureSpawn += delta
    if (this.lastCreatureSpawn > 3000 && this.ambientCreatures.length < 6) {
      this.spawnAmbientCreature(cx, cy, cw, ch)
      this.lastCreatureSpawn = 0
    }

    const dt = delta / 1000
    for (let i = this.ambientCreatures.length - 1; i >= 0; i--) {
      const c = this.ambientCreatures[i]
      c.lifetime -= delta

      if (c.type === 'butterfly') {
        c.sprite.x += c.vx * dt
        c.sprite.y += c.vy * dt + Math.sin(Date.now() * 0.005 + i) * 0.3
        c.sprite.setRotation(Math.sin(Date.now() * 0.008 + i) * 0.2)
      }
      else {
        c.sprite.x += c.vx * dt
        c.sprite.y += c.vy * dt
      }

      if (c.lifetime <= 0 || c.sprite.x < cx - 30 || c.sprite.x > cx + cw + 30) {
        c.sprite.destroy()
        this.ambientCreatures.splice(i, 1)
      }
    }
  }

  private spawnAmbientCreature(cx: number, cy: number, cw: number, ch: number) {
    if (this.seasonSystem.season === 'winter') return

    const type = this.rng.frac() > 0.3 ? 'butterfly' : 'ladybug'

    if (type === 'butterfly') {
      const sprite = this.add.sprite(
        cx + (this.rng.frac() > 0.5 ? -10 : cw + 10),
        cy + this.rng.between(10, ch - 10),
        'butterfly',
      )
      sprite.setDepth(DEPTH.WEATHER - 1)
      sprite.setScale(0.8)

      this.ambientCreatures.push({
        sprite,
        vx: (this.rng.frac() > 0.5 ? 1 : -1) * (8 + this.rng.frac() * 12),
        vy: (this.rng.frac() - 0.5) * 5,
        lifetime: 8000 + this.rng.frac() * 6000,
        type: 'butterfly',
      })
    }
    else {
      const sprite = this.add.sprite(
        cx + this.rng.between(20, cw - 20),
        cy + ch - this.rng.between(5, 20),
        'ladybug',
      )
      sprite.setDepth(DEPTH.GROUND_DETAIL + 1)

      this.ambientCreatures.push({
        sprite,
        vx: (this.rng.frac() - 0.5) * 6,
        vy: (this.rng.frac() - 0.5) * 3,
        lifetime: 5000 + this.rng.frac() * 4000,
        type: 'ladybug',
      })
    }
  }

  // ── World Animation ─────────────────────────────

  private animateWorld(delta: number) {
    const time = this.time.now
    const wind = this.weatherSystem.wind

    // Flower sway
    for (const f of this.flowers) {
      const sway = Math.sin(time / 800 + f.swayOffset) * 0.06
      const windEffect = wind * 0.04
      f.sprite.setRotation(sway + windEffect)
    }

    // Tall grass sway
    for (const g of this.grassDetails) {
      const sway = Math.sin(time / 600 + g.x * 0.1) * 0.08
      const windEffect = wind * 0.06
      g.setRotation(sway + windEffect)
    }

    // Tree foliage sway
    for (const t of this.trees) {
      const sway = Math.sin(time / 1200 + t.swayOffset) * 0.02
      const windEffect = wind * 0.015
      t.foliage.setRotation(sway + windEffect)

      // Apply season tint
      t.foliage.setTint(this.seasonSystem.getTint('treeFoliage'))
    }
  }

  private updateNestGlow() {
    if (!this.nestGlow || !this.bumblebeeNest) return

    // Pulse glow when unicorn is nearby
    const dist = Phaser.Math.Distance.Between(
      this.unicorn.x,
      this.unicorn.y,
      this.bumblebeeNest.x,
      this.bumblebeeNest.y,
    )

    if (dist < 80) {
      const pulse = (Math.sin(this.time.now / 500) + 1) / 2
      this.nestGlow.setAlpha(0.1 + pulse * 0.15)
    }
    else {
      this.nestGlow.setAlpha(0)
    }
  }

  // ── Utils ───────────────────────────────────────

  private emitEvent(event: string, data: Record<string, unknown>) {
    this.game.events.emit(event, data)
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
