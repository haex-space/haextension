import type { CutsceneConfig } from '../CutsceneScene'

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
            const color = flowerColors[i % flowerColors.length]
            if (color === undefined) continue
            const fx = (Math.random() - 0.5) * 200
            const fy = 25 + Math.random() * 30
            const flower = scene.add.graphics()
            flower.fillStyle(0x3a6a28)
            flower.fillRect(fx, fy, 1, 5)
            flower.fillStyle(color)
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
