export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export type FlowerType = 'crocus' | 'clover' | 'lavender' | 'foxglove' | 'snapdragon'

export type BumblebeeRole = 'queen' | 'worker' | 'drone' | 'young-queen'

export type EntityAnimationState =
  | 'idle'
  | 'walking'
  | 'flying'
  | 'collecting'
  | 'vibrating'
  | 'carrying'
  | 'brooding'
  | 'fleeing'
  | 'stunned'

export interface Position {
  x: number
  y: number
}

export interface FlowerState {
  id: string
  type: FlowerType
  position: Position
  pollinated: boolean
  fruiting: boolean
  nectarAmount: number
}

export interface NestState {
  location: Position | null
  waxCells: number
  pollenStorage: number
  nectarStorage: number
  eggs: number
  larvae: number
  cocoons: number
  workers: number
  drones: number
  youngQueens: number
  honeyPot: number
}

export interface WorldState {
  season: Season
  dayProgress: number
  flowers: FlowerState[]
  nest: NestState
  chapter: number
  completedTasks: string[]
  isSecondCycle: boolean
}

export interface BumblebeeState {
  role: BumblebeeRole
  energy: number
  pollenLoad: number
  nectarLoad: number
  bodyTemperature: number
}

export interface CutsceneFrame {
  spritesheet: string
  animation: string
  duration: number
}

export interface CutsceneData {
  frames: CutsceneFrame[]
}

export interface Task {
  id: string
  scene: string
  completionCheck: (world: WorldState) => boolean
  onComplete: (world: WorldState) => WorldState
}

export interface Chapter {
  id: number
  season: Season
  tasks: Task[]
  unlockCondition: (world: WorldState) => boolean
  cutsceneOnStart?: CutsceneData
  cutsceneOnEnd?: CutsceneData
}

export interface GameEvents {
  'scene-change': { from: string, to: string }
  'task-complete': { taskId: string, chapter: number }
  'season-change': { from: Season, to: Season }
  'world-update': WorldState
}
