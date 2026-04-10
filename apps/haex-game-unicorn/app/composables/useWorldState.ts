import { eq } from 'drizzle-orm'
import { worldState, completedTasks, flowers, nest } from '~/database/schemas'
import type { Season, WorldState, NestState, FlowerState } from '~/types/game'

export function useWorldState() {
  const { orm } = useHaexVaultStore()

  async function loadWorldStateAsync(): Promise<WorldState | null> {
    if (!orm) return null

    const [state] = await orm.select().from(worldState).limit(1)
    if (!state) return null

    const flowerRows = await orm.select().from(flowers)
    const [nestRow] = await orm.select().from(nest).limit(1)
    const taskRows = await orm.select().from(completedTasks)

    return {
      season: state.season as Season,
      dayProgress: state.dayProgress,
      chapter: state.chapter,
      isSecondCycle: state.isSecondCycle,
      completedTasks: taskRows.map(t => t.id),
      flowers: flowerRows.map(f => ({
        id: f.id,
        type: f.type as FlowerState['type'],
        position: { x: f.x, y: f.y },
        pollinated: f.pollinated,
        fruiting: f.fruiting,
        nectarAmount: f.nectarAmount,
      })),
      nest: nestRow
        ? {
            location: nestRow.x != null && nestRow.y != null ? { x: nestRow.x, y: nestRow.y } : null,
            waxCells: nestRow.waxCells,
            pollenStorage: nestRow.pollenStorage,
            nectarStorage: nestRow.nectarStorage,
            eggs: nestRow.eggs,
            larvae: nestRow.larvae,
            cocoons: nestRow.cocoons,
            workers: nestRow.workers,
            drones: nestRow.drones,
            youngQueens: nestRow.youngQueens,
            honeyPot: nestRow.honeyPot,
          }
        : {
            location: null,
            waxCells: 0,
            pollenStorage: 0,
            nectarStorage: 0,
            eggs: 0,
            larvae: 0,
            cocoons: 0,
            workers: 0,
            drones: 0,
            youngQueens: 0,
            honeyPot: 0,
          },
    }
  }

  async function createInitialWorldStateAsync(): Promise<void> {
    if (!orm) return

    await orm.insert(worldState).values({
      id: 'main',
      season: 'spring',
      dayProgress: 0,
      chapter: 1,
      isSecondCycle: false,
    })

    await orm.insert(nest).values({
      id: 'main',
    })
  }

  async function updateSeasonAsync(season: Season): Promise<void> {
    if (!orm) return
    await orm.update(worldState).set({ season }).where(eq(worldState.id, 'main'))
  }

  async function updateChapterAsync(chapter: number): Promise<void> {
    if (!orm) return
    await orm.update(worldState).set({ chapter }).where(eq(worldState.id, 'main'))
  }

  async function completeTaskAsync(taskId: string, chapter: number): Promise<void> {
    if (!orm) return
    await orm.insert(completedTasks).values({ id: taskId, chapter })
  }

  async function updateNestAsync(updates: Partial<NestState>): Promise<void> {
    if (!orm) return

    const dbUpdates: Record<string, unknown> = {}
    if (updates.location) {
      dbUpdates.x = updates.location.x
      dbUpdates.y = updates.location.y
    }
    if (updates.waxCells !== undefined) dbUpdates.waxCells = updates.waxCells
    if (updates.pollenStorage !== undefined) dbUpdates.pollenStorage = updates.pollenStorage
    if (updates.nectarStorage !== undefined) dbUpdates.nectarStorage = updates.nectarStorage
    if (updates.eggs !== undefined) dbUpdates.eggs = updates.eggs
    if (updates.larvae !== undefined) dbUpdates.larvae = updates.larvae
    if (updates.cocoons !== undefined) dbUpdates.cocoons = updates.cocoons
    if (updates.workers !== undefined) dbUpdates.workers = updates.workers
    if (updates.drones !== undefined) dbUpdates.drones = updates.drones
    if (updates.youngQueens !== undefined) dbUpdates.youngQueens = updates.youngQueens
    if (updates.honeyPot !== undefined) dbUpdates.honeyPot = updates.honeyPot

    await orm.update(nest).set(dbUpdates).where(eq(nest.id, 'main'))
  }

  async function pollinateFlowerAsync(flowerId: string): Promise<void> {
    if (!orm) return
    await orm.update(flowers).set({ pollinated: true }).where(eq(flowers.id, flowerId))
  }

  return {
    loadWorldStateAsync,
    createInitialWorldStateAsync,
    updateSeasonAsync,
    updateChapterAsync,
    completeTaskAsync,
    updateNestAsync,
    pollinateFlowerAsync,
  }
}
