import Phaser from 'phaser'
import { createGameConfig } from '../game/config'

export function useGame() {
  let game: Phaser.Game | null = null
  const isReady = ref(false)

  function mount(container: HTMLElement) {
    destroy()

    game = new Phaser.Game(createGameConfig(container))
    game.events.on('scene-ready', () => {
      isReady.value = true
    })
  }

  function destroy() {
    if (!game) return

    game.destroy(true)
    game = null
    isReady.value = false
  }

  return {
    mount,
    destroy,
    isReady: readonly(isReady),
  }
}
