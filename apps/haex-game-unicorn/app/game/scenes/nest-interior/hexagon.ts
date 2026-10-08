import Phaser from 'phaser'

export function drawHexagon(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, fill = false) {
  const points: number[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    points.push(cx + r * Math.cos(angle))
    points.push(cy + r * Math.sin(angle))
  }

  if (fill) {
    gfx.fillPoints(points.map((v, i) => i % 2 === 0
      ? new Phaser.Geom.Point(v, points[i + 1])
      : undefined,
    ).filter(Boolean) as Phaser.Geom.Point[], true)
  }
  else {
    gfx.strokePoints(points.map((v, i) => i % 2 === 0
      ? new Phaser.Geom.Point(v, points[i + 1])
      : undefined,
    ).filter(Boolean) as Phaser.Geom.Point[], true)
  }
}

export function drawHexFilled(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
  const points: Phaser.Geom.Point[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    points.push(new Phaser.Geom.Point(cx + r * Math.cos(angle), cy + r * Math.sin(angle)))
  }
  gfx.fillPoints(points, true)
}
