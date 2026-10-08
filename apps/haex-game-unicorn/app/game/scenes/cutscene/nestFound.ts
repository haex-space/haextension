import type { CutsceneConfig } from '../CutsceneScene'

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
