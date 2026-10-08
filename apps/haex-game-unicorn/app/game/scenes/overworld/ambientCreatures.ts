import type Phaser from 'phaser'
import { DEPTH } from './constants'
import type { AmbientCreature } from './constants'

export function createAmbientCreature(
  scene: Phaser.Scene,
  rng: Phaser.Math.RandomDataGenerator,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
): AmbientCreature {
  const type = rng.frac() > 0.3 ? 'butterfly' : 'ladybug'

  if (type === 'butterfly') {
    const sprite = scene.add.sprite(
      cx + (rng.frac() > 0.5 ? -10 : cw + 10),
      cy + rng.between(10, ch - 10),
      'butterfly',
    )
    sprite.setDepth(DEPTH.WEATHER - 1)
    sprite.setScale(0.8)

    return {
      sprite,
      vx: (rng.frac() > 0.5 ? 1 : -1) * (8 + rng.frac() * 12),
      vy: (rng.frac() - 0.5) * 5,
      lifetime: 8000 + rng.frac() * 6000,
      type: 'butterfly',
    }
  }
  else {
    const sprite = scene.add.sprite(
      cx + rng.between(20, cw - 20),
      cy + ch - rng.between(5, 20),
      'ladybug',
    )
    sprite.setDepth(DEPTH.GROUND_DETAIL + 1)

    return {
      sprite,
      vx: (rng.frac() - 0.5) * 6,
      vy: (rng.frac() - 0.5) * 3,
      lifetime: 5000 + rng.frac() * 4000,
      type: 'ladybug',
    }
  }
}
