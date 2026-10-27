import { describe, expect, it } from 'vitest'
import { createStopwatch } from './stopwatch'

function clock() {
  let time = 1000
  return { now: () => time, advance: (ms: number) => { time += ms } }
}

describe('stopwatch', () => {
  it('reads 0 until it is started', () => {
    const c = clock()
    const watch = createStopwatch(c.now)
    c.advance(5000)
    expect(watch.elapsed()).toBe(0)
    expect(watch.started).toBe(false)
  })

  it('counts from the first start and ignores later starts', () => {
    const c = clock()
    const watch = createStopwatch(c.now)
    watch.start()
    c.advance(1000)
    watch.start()
    c.advance(500)
    expect(watch.elapsed()).toBe(1500)
  })

  it('does not count a paused span', () => {
    const c = clock()
    const watch = createStopwatch(c.now)
    watch.start()
    c.advance(2000)
    watch.pause()
    c.advance(10_000)
    expect(watch.elapsed()).toBe(2000)
    watch.resume()
    c.advance(300)
    expect(watch.elapsed()).toBe(2300)
  })

  it('is harmless to pause twice or resume twice', () => {
    const c = clock()
    const watch = createStopwatch(c.now)
    watch.start()
    c.advance(100)
    watch.pause()
    watch.pause()
    c.advance(500)
    watch.resume()
    watch.resume()
    c.advance(100)
    expect(watch.elapsed()).toBe(200)
  })

  it('does nothing on pause or resume before it was started', () => {
    const c = clock()
    const watch = createStopwatch(c.now)
    watch.resume()
    watch.pause()
    c.advance(100)
    expect(watch.elapsed()).toBe(0)
    watch.start()
    c.advance(100)
    expect(watch.elapsed()).toBe(100)
  })

  it('stops for good when frozen', () => {
    const c = clock()
    const watch = createStopwatch(c.now)
    watch.start()
    c.advance(700)
    watch.freeze()
    c.advance(5000)
    watch.resume()
    c.advance(5000)
    expect(watch.elapsed()).toBe(700)
  })
})
