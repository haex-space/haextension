import Phaser from 'phaser'
import type { Season } from '../../types/game'

export class WeatherSystem {
  private scene: Phaser.Scene
  private windStrength = 0
  private windTarget = 0
  private windChangeTimer = 0
  private particles: Phaser.GameObjects.Graphics[] = []
  private snowflakes: { x: number, y: number, speed: number, drift: number, size: number }[] = []
  private leaves: { x: number, y: number, speed: number, drift: number, rotation: number }[] = []

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  get wind(): number {
    return this.windStrength
  }

  update(delta: number, season: Season, cameraX: number, cameraY: number, cameraW: number, cameraH: number) {
    this.updateWind(delta)

    if (season === 'winter') {
      this.updateSnow(delta, cameraX, cameraY, cameraW, cameraH)
    }
    else if (season === 'autumn') {
      this.updateFallingLeaves(delta, cameraX, cameraY, cameraW, cameraH)
    }
  }

  private updateWind(delta: number) {
    this.windChangeTimer -= delta
    if (this.windChangeTimer <= 0) {
      this.windTarget = (Math.random() - 0.5) * 2
      this.windChangeTimer = 3000 + Math.random() * 5000
    }
    this.windStrength += (this.windTarget - this.windStrength) * 0.001 * delta
  }

  private updateSnow(delta: number, cx: number, cy: number, cw: number, ch: number) {
    // Spawn snowflakes
    if (this.snowflakes.length < 60 && Math.random() < 0.3) {
      this.snowflakes.push({
        x: cx + Math.random() * cw,
        y: cy - 10,
        speed: 15 + Math.random() * 25,
        drift: (Math.random() - 0.5) * 20,
        size: 1 + Math.random() * 2,
      })
    }

    // Update existing
    const dt = delta / 1000
    for (let i = this.snowflakes.length - 1; i >= 0; i--) {
      const s = this.snowflakes[i]
      s.y += s.speed * dt
      s.x += (s.drift + this.windStrength * 15) * dt
      s.x += Math.sin(s.y * 0.02 + s.drift) * 0.3

      if (s.y > cy + ch + 10 || s.x < cx - 20 || s.x > cx + cw + 20) {
        this.snowflakes.splice(i, 1)
      }
    }
  }

  private updateFallingLeaves(delta: number, cx: number, cy: number, cw: number, ch: number) {
    // Spawn leaves
    if (this.leaves.length < 15 && Math.random() < 0.05) {
      this.leaves.push({
        x: cx + Math.random() * cw,
        y: cy - 10,
        speed: 10 + Math.random() * 15,
        drift: (Math.random() - 0.5) * 30,
        rotation: Math.random() * Math.PI * 2,
      })
    }

    const dt = delta / 1000
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i]
      l.y += l.speed * dt
      l.x += (l.drift + this.windStrength * 20) * dt
      l.x += Math.sin(l.y * 0.03 + l.drift) * 0.8
      l.rotation += dt * 2

      if (l.y > cy + ch + 10) {
        this.leaves.splice(i, 1)
      }
    }
  }

  draw(gfx: Phaser.GameObjects.Graphics) {
    gfx.clear()

    // Draw snowflakes
    for (const s of this.snowflakes) {
      gfx.fillStyle(0xffffff, 0.8)
      gfx.fillCircle(s.x, s.y, s.size)
    }

    // Draw falling leaves
    for (const l of this.leaves) {
      gfx.fillStyle(0xc47a2a, 0.7)
      gfx.save()
      gfx.fillEllipse(l.x, l.y, 4, 2)
      gfx.restore()
    }
  }
}
