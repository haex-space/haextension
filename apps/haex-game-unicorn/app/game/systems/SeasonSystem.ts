import Phaser from 'phaser'
import type { Season } from '../../types/game'

export interface SeasonPalette {
  sky: number
  skyBottom: number
  grass: number
  grassAlt: number
  treeFoliage: number
  treeFoliageAlt: number
  flowerTint: number
  ambientLight: number
  fogAlpha: number
}

const PALETTES: Record<Season, SeasonPalette> = {
  spring: {
    sky: 0x87ceeb,
    skyBottom: 0xc5e8f7,
    grass: 0x5a8f3d,
    grassAlt: 0x4a7f2d,
    treeFoliage: 0x3a8a28,
    treeFoliageAlt: 0x2d7a1e,
    flowerTint: 0xffffff,
    ambientLight: 0xfff8e7,
    fogAlpha: 0.0,
  },
  summer: {
    sky: 0x4a90d9,
    skyBottom: 0x87ceeb,
    grass: 0x4a8f3d,
    grassAlt: 0x3a7f2d,
    treeFoliage: 0x2d6a1e,
    treeFoliageAlt: 0x1e5a10,
    flowerTint: 0xffffff,
    ambientLight: 0xfff0c0,
    fogAlpha: 0.0,
  },
  autumn: {
    sky: 0x9aafcf,
    skyBottom: 0xd4c5a0,
    grass: 0x8a7f3d,
    grassAlt: 0x7a6f2d,
    treeFoliage: 0xc47a2a,
    treeFoliageAlt: 0xd4942a,
    flowerTint: 0xddccaa,
    ambientLight: 0xffe0a0,
    fogAlpha: 0.15,
  },
  winter: {
    sky: 0xb0c4de,
    skyBottom: 0xd8dce8,
    grass: 0x7a8a6a,
    grassAlt: 0x8a9a7a,
    treeFoliage: 0x5a6a4a,
    treeFoliageAlt: 0x4a5a3a,
    flowerTint: 0xaabbcc,
    ambientLight: 0xd8e0f0,
    fogAlpha: 0.2,
  },
}

export class SeasonSystem {
  private scene: Phaser.Scene
  private currentSeason: Season = 'spring'
  private transitionProgress = 1 // 1 = fully transitioned
  private targetSeason: Season = 'spring'

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  get season(): Season {
    return this.currentSeason
  }

  get palette(): SeasonPalette {
    return PALETTES[this.currentSeason]
  }

  setSeason(season: Season) {
    if (season === this.currentSeason && this.transitionProgress >= 1) return
    this.targetSeason = season
    this.transitionProgress = 0
  }

  update(delta: number) {
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + delta / 3000)
      if (this.transitionProgress >= 1) {
        this.currentSeason = this.targetSeason
      }
    }
  }

  getTint(baseTint: 'grass' | 'treeFoliage' | 'flowerTint'): number {
    if (this.transitionProgress >= 1) {
      return PALETTES[this.currentSeason][baseTint]
    }
    return this.lerpColor(
      PALETTES[this.currentSeason][baseTint],
      PALETTES[this.targetSeason][baseTint],
      this.transitionProgress,
    )
  }

  getSkyColor(top: boolean): number {
    const key = top ? 'sky' : 'skyBottom'
    if (this.transitionProgress >= 1) {
      return PALETTES[this.currentSeason][key]
    }
    return this.lerpColor(
      PALETTES[this.currentSeason][key],
      PALETTES[this.targetSeason][key],
      this.transitionProgress,
    )
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
