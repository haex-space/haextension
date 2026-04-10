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

    // Gradient sky
    const steps = 16
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const color = this.lerpColor(palette.sky, palette.skyBottom, t)
      this.skyGradient.fillStyle(color, 1)
      const yStart = (GAME_HEIGHT / steps) * i
      const yHeight = GAME_HEIGHT / steps + 1
      this.skyGradient.fillRect(0, yStart, GAME_WIDTH, yHeight)
    }
  }

  private createParallaxLayers() {
    // Mountains (distant, slow scroll)
    const mountainGfx = this.make.graphics({ x: 0, y: 0 })
    mountainGfx.fillStyle(0x6a8a6a, 0.5)
    for (let i = 0; i < 8; i++) {
      const peakX = i * 60 + 30
      const peakY = 20 + Math.sin(i * 1.5) * 15
      mountainGfx.fillTriangle(
        peakX - 40, 64,
        peakX, peakY,
        peakX + 40, 64,
      )
    }
    mountainGfx.fillStyle(0x5a7a5a, 0.4)
    for (let i = 0; i < 6; i++) {
      const peakX = i * 80 + 50
      const peakY = 30 + Math.sin(i * 2.1) * 10
      mountainGfx.fillTriangle(
        peakX - 50, 64,
        peakX, peakY,
        peakX + 50, 64,
      )
    }
    mountainGfx.generateTexture('mountains-tex', 480, 64)
    mountainGfx.destroy()

    this.mountainLayer = this.add.tileSprite(GAME_WIDTH / 2, 20, GAME_WIDTH, 64, 'mountains-tex')
    this.mountainLayer.setScrollFactor(0)
    this.mountainLayer.setDepth(DEPTH.MOUNTAINS)
    this.mountainLayer.setOrigin(0.5, 0)

    // Far tree silhouettes
    const farTreeGfx = this.make.graphics({ x: 0, y: 0 })
    farTreeGfx.fillStyle(0x2a5a2a, 0.4)
    for (let i = 0; i < 24; i++) {
      const tx = i * 20 + 10
      const height = 12 + Math.sin(i * 1.7) * 6
      farTreeGfx.fillCircle(tx, 32 - height / 2, height / 2)
      farTreeGfx.fillRect(tx - 1, 32 - height / 2, 2, height / 2 + 8)
    }
    farTreeGfx.generateTexture('far-trees-tex', 480, 40)
    farTreeGfx.destroy()

    this.farTreeLayer = this.add.tileSprite(GAME_WIDTH / 2, 52, GAME_WIDTH, 40, 'far-trees-tex')
    this.farTreeLayer.setScrollFactor(0)
    this.farTreeLayer.setDepth(DEPTH.FAR_TREES)
    this.farTreeLayer.setOrigin(0.5, 0)

    // Clouds
    this.createClouds()
  }

  private createClouds() {
    const cloudGfx = this.make.graphics({ x: 0, y: 0 })
    cloudGfx.fillStyle(0xffffff, 0.6)
    cloudGfx.fillEllipse(16, 10, 28, 12)
    cloudGfx.fillEllipse(10, 12, 16, 10)
    cloudGfx.fillEllipse(22, 12, 20, 10)
    cloudGfx.generateTexture('cloud', 40, 20)
    cloudGfx.destroy()

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

    // Parallax scroll — distant layers move slower
    this.mountainLayer.tilePositionX = scrollX * 0.05
    this.mountainLayer.y = Math.max(0, 10 - scrollY * 0.03)
    this.farTreeLayer.tilePositionX = scrollX * 0.1
    this.farTreeLayer.y = Math.max(30, 50 - scrollY * 0.05)

    // Cloud drift
    for (const cloud of this.clouds) {
      cloud.x += cloud.getData('speed') as number * 0.005
      if (cloud.x > GAME_WIDTH + 50) {
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
    // Tall grass tufts that sway in the wind
    const tallGrassGfx = this.make.graphics({ x: 0, y: 0 })
    tallGrassGfx.fillStyle(0x5a9f3d)
    tallGrassGfx.fillTriangle(4, 16, 3, 2, 5, 16)
    tallGrassGfx.fillStyle(0x4a8f2d)
    tallGrassGfx.fillTriangle(8, 16, 7, 0, 9, 16)
    tallGrassGfx.fillStyle(0x6aaf4d)
    tallGrassGfx.fillTriangle(12, 16, 11, 4, 13, 16)
    tallGrassGfx.generateTexture('tall-grass', 16, 16)
    tallGrassGfx.destroy()

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
    // Better tree with separate trunk + foliage for depth sorting
    const trunkGfx = this.make.graphics({ x: 0, y: 0 })
    trunkGfx.fillStyle(0x6b4423)
    trunkGfx.fillRect(12, 16, 8, 28)
    trunkGfx.fillStyle(0x5a3818)
    trunkGfx.fillRect(14, 16, 2, 28)
    trunkGfx.generateTexture('tree-trunk', 32, 48)
    trunkGfx.destroy()

    const foliageGfx = this.make.graphics({ x: 0, y: 0 })
    foliageGfx.fillStyle(0x2d6a1e)
    foliageGfx.fillCircle(20, 18, 16)
    foliageGfx.fillStyle(0x3a8a28)
    foliageGfx.fillCircle(14, 14, 10)
    foliageGfx.fillCircle(26, 14, 9)
    foliageGfx.fillStyle(0x4a9a38)
    foliageGfx.fillCircle(18, 10, 7)
    foliageGfx.generateTexture('tree-foliage', 40, 36)
    foliageGfx.destroy()

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
      { key: 'flower-pink', color: 0xff6b9d, center: 0xffdd44 },
      { key: 'flower-blue', color: 0x6b9dff, center: 0xffffff },
      { key: 'flower-yellow', color: 0xffdd44, center: 0xff8844 },
      { key: 'flower-white', color: 0xffffff, center: 0xffee88 },
      { key: 'flower-purple', color: 0xbb77dd, center: 0xffdd88 },
    ]

    // Generate flower textures
    for (const ft of flowerTypes) {
      const gfx = this.make.graphics({ x: 0, y: 0 })
      // Stem
      gfx.fillStyle(0x3a7a28)
      gfx.fillRect(7, 9, 2, 7)
      // Petals
      gfx.fillStyle(ft.color)
      gfx.fillCircle(8, 6, 3)
      gfx.fillCircle(5, 7, 2.5)
      gfx.fillCircle(11, 7, 2.5)
      gfx.fillCircle(6, 4, 2.5)
      gfx.fillCircle(10, 4, 2.5)
      // Center
      gfx.fillStyle(ft.center)
      gfx.fillCircle(8, 6, 1.5)
      gfx.generateTexture(ft.key, 16, 16)
      gfx.destroy()
    }

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
    // More detailed nest
    const nestGfx = this.make.graphics({ x: 0, y: 0 })
    // Earth mound
    nestGfx.fillStyle(0x6a5a3a)
    nestGfx.fillEllipse(16, 18, 28, 14)
    nestGfx.fillStyle(0x5a4a2a)
    nestGfx.fillEllipse(16, 16, 24, 12)
    // Entrance hole
    nestGfx.fillStyle(0x2a1a0a)
    nestGfx.fillEllipse(16, 19, 6, 5)
    // Grass around entrance
    nestGfx.fillStyle(0x4a8f3d)
    nestGfx.fillTriangle(4, 22, 3, 12, 6, 22)
    nestGfx.fillTriangle(26, 22, 28, 10, 29, 22)
    nestGfx.generateTexture('bumblebee-nest-v2', 32, 26)
    nestGfx.destroy()

    const nestX = (MAP_WIDTH * TILE_SIZE) / 2 + 100
    const nestY = (MAP_HEIGHT * TILE_SIZE) / 2 - 60

    // Subtle glow to draw attention
    this.nestGlow = this.add.ellipse(nestX, nestY + 2, 40, 24, 0xffee88, 0)
    this.nestGlow.setDepth(DEPTH.NEST - 0.1)

    this.bumblebeeNest = this.add.sprite(nestX, nestY, 'bumblebee-nest-v2')
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
    }
    else {
      anim = vy < 0 ? 'unicorn-walk-up' : 'unicorn-walk-down'
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
      if (!this.textures.exists('butterfly')) {
        const gfx = this.make.graphics({ x: 0, y: 0 })
        const colors = [0xff88aa, 0xffaa44, 0x88aaff, 0xffff77]
        const color = colors[this.rng.between(0, colors.length - 1)]
        gfx.fillStyle(color, 0.8)
        gfx.fillEllipse(3, 4, 5, 6)
        gfx.fillEllipse(9, 4, 5, 6)
        gfx.fillStyle(0x333333)
        gfx.fillRect(5, 2, 2, 8)
        gfx.generateTexture('butterfly', 12, 10)
        gfx.destroy()
      }

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
      if (!this.textures.exists('ladybug')) {
        const gfx = this.make.graphics({ x: 0, y: 0 })
        gfx.fillStyle(0xdd2222)
        gfx.fillCircle(4, 4, 3)
        gfx.fillStyle(0x111111)
        gfx.fillCircle(3, 3, 1)
        gfx.fillCircle(5, 5, 1)
        gfx.fillRect(3.5, 1, 1, 6)
        gfx.generateTexture('ladybug', 8, 8)
        gfx.destroy()
      }

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
