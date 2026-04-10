import Phaser from 'phaser'
import type { Season } from '../../types/game'

/**
 * AudioSystem manages ambient sounds, music, and sound effects.
 *
 * For v1.0 this uses procedurally generated placeholder sounds.
 * Real sounds (xeno-canto bird calls, freesound.org ambience)
 * will replace these in future versions.
 */
export class AudioSystem {
  private scene: Phaser.Scene
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private ambienceGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null

  private isInitialized = false
  private currentSeason: Season = 'spring'

  // Active sounds
  private ambienceOscillators: OscillatorNode[] = []
  private birdTimer: ReturnType<typeof setTimeout> | null = null

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Must be called from a user gesture (tap/click) to unlock Web Audio
   */
  init() {
    if (this.isInitialized) return

    try {
      this.audioContext = new AudioContext()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.gain.value = 0.3
      this.masterGain.connect(this.audioContext.destination)

      this.ambienceGain = this.audioContext.createGain()
      this.ambienceGain.gain.value = 0.15
      this.ambienceGain.connect(this.masterGain)

      this.musicGain = this.audioContext.createGain()
      this.musicGain.gain.value = 0.1
      this.musicGain.connect(this.masterGain)

      this.sfxGain = this.audioContext.createGain()
      this.sfxGain.gain.value = 0.4
      this.sfxGain.connect(this.masterGain)

      this.isInitialized = true
    }
    catch {
      // Web Audio not supported — silent mode
    }
  }

  setSeason(season: Season) {
    this.currentSeason = season
    this.updateAmbience()
  }

  /**
   * Play a short sound effect
   */
  playSfx(type: 'collect' | 'pollinate' | 'vibrate' | 'warning' | 'success') {
    if (!this.audioContext || !this.sfxGain) return

    const ctx = this.audioContext
    const now = ctx.currentTime

    switch (type) {
      case 'collect': {
        // Soft "poff" — brief noise burst
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(800, now)
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1)
        gain.gain.setValueAtTime(0.3, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
        osc.connect(gain)
        gain.connect(this.sfxGain)
        osc.start(now)
        osc.stop(now + 0.15)
        break
      }
      case 'pollinate': {
        // Ascending chime
        const notes = [523, 659, 784] // C5, E5, G5
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0, now + i * 0.08)
          gain.gain.linearRampToValueAtTime(0.2, now + i * 0.08 + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.3)
          osc.connect(gain)
          gain.connect(this.sfxGain!)
          osc.start(now + i * 0.08)
          osc.stop(now + i * 0.08 + 0.3)
        })
        break
      }
      case 'vibrate': {
        // Low buzz
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.value = 120
        gain.gain.setValueAtTime(0.1, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
        osc.connect(gain)
        gain.connect(this.sfxGain)
        osc.start(now)
        osc.stop(now + 0.2)
        break
      }
      case 'warning': {
        // Low thump
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(200, now)
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.3)
        gain.gain.setValueAtTime(0.3, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
        osc.connect(gain)
        gain.connect(this.sfxGain)
        osc.start(now)
        osc.stop(now + 0.3)
        break
      }
      case 'success': {
        // Happy ascending melody
        const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0, now + i * 0.1)
          gain.gain.linearRampToValueAtTime(0.15, now + i * 0.1 + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.4)
          osc.connect(gain)
          gain.connect(this.sfxGain!)
          osc.start(now + i * 0.1)
          osc.stop(now + i * 0.1 + 0.4)
        })
        break
      }
    }
  }

  private updateAmbience() {
    this.stopAmbience()

    if (!this.audioContext || !this.ambienceGain) return

    const ctx = this.audioContext

    if (this.currentSeason === 'winter') {
      // Wind whistle
      this.createWindSound(ctx)
    }
    else {
      // Nature ambience — soft oscillators simulating crickets/insects
      this.createInsectAmbience(ctx)
      if (this.currentSeason !== 'autumn') {
        this.startBirdCalls()
      }
    }
  }

  private createWindSound(ctx: AudioContext) {
    // White noise filtered to sound like wind
    const bufferSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400

    const gain = ctx.createGain()
    gain.gain.value = 0.08

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.ambienceGain!)
    source.start()
  }

  private createInsectAmbience(ctx: AudioContext) {
    // Soft high-frequency chirps
    const chirp = () => {
      if (!this.isInitialized) return

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 4000 + Math.random() * 2000
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
      osc.connect(gain)
      gain.connect(this.ambienceGain!)
      osc.start()
      osc.stop(ctx.currentTime + 0.05)
    }

    // Random chirps
    const scheduleChirp = () => {
      if (!this.isInitialized) return
      chirp()
      this.birdTimer = setTimeout(scheduleChirp, 200 + Math.random() * 1500)
    }
    scheduleChirp()
  }

  private startBirdCalls() {
    // Periodic bird-like whistles (simplified)
    const ctx = this.audioContext!
    const birdCall = () => {
      if (!this.isInitialized || !this.ambienceGain) return

      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      // Rising then falling pitch — simple bird whistle
      osc.frequency.setValueAtTime(1200, now)
      osc.frequency.linearRampToValueAtTime(1800, now + 0.15)
      osc.frequency.linearRampToValueAtTime(1400, now + 0.3)

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.04, now + 0.05)
      gain.gain.linearRampToValueAtTime(0.04, now + 0.2)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc.connect(gain)
      gain.connect(this.ambienceGain!)
      osc.start(now)
      osc.stop(now + 0.35)
    }

    const scheduleBird = () => {
      if (!this.isInitialized) return
      birdCall()
      setTimeout(scheduleBird, 3000 + Math.random() * 8000)
    }
    setTimeout(scheduleBird, 2000 + Math.random() * 3000)
  }

  private stopAmbience() {
    for (const osc of this.ambienceOscillators) {
      try { osc.stop() }
      catch { /* already stopped */ }
    }
    this.ambienceOscillators = []

    if (this.birdTimer) {
      clearTimeout(this.birdTimer)
      this.birdTimer = null
    }
  }

  destroy() {
    this.stopAmbience()
    this.isInitialized = false
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}
