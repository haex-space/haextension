import Phaser from 'phaser'
import { createGameConfig } from '../game/config'
import type { Season } from '../types/game'

let gameInstance: Phaser.Game | null = null

export function useGame() {
  const currentScene = ref<string>('BootScene')
  const currentSeason = ref<Season>('spring')
  const currentChapter = ref(1)
  const isReady = ref(false)

  function mount(container: HTMLElement) {
    if (gameInstance) {
      gameInstance.destroy(true)
    }

    const config = createGameConfig(container)
    gameInstance = new Phaser.Game(config)

    gameInstance.events.on('scene-ready', (data: { scene: string }) => {
      currentScene.value = data.scene
      isReady.value = true
    })

    gameInstance.events.on('season-change', (data: { from: Season, to: Season }) => {
      currentSeason.value = data.to
    })

    gameInstance.events.on('nest-interact', (_data: { nestType: string }) => {
      // Will be used later for scene transitions to bumblebee gameplay
    })
  }

  function destroy() {
    if (gameInstance) {
      gameInstance.destroy(true)
      gameInstance = null
      isReady.value = false
    }
  }

  function getGame(): Phaser.Game | null {
    return gameInstance
  }

  return {
    mount,
    destroy,
    getGame,
    currentScene: readonly(currentScene),
    currentSeason: readonly(currentSeason),
    currentChapter: readonly(currentChapter),
    isReady: readonly(isReady),
  }
}
