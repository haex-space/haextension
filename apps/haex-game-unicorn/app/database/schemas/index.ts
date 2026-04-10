import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { getTableName } from '@haex-space/vault-sdk'
import manifest from '../../../haextension/manifest.json'
import packageJson from '../../../package.json'

const tableName = (name: string) =>
  getTableName(manifest.publicKey, packageJson.name, name)

export const worldState = sqliteTable(
  tableName('world_state'),
  {
    id: text().primaryKey().$defaultFn(() => 'main'),
    season: text().notNull().default('spring'),
    dayProgress: real('day_progress').notNull().default(0),
    chapter: integer().notNull().default(1),
    isSecondCycle: integer('is_second_cycle', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
)
export type SelectWorldState = typeof worldState.$inferSelect
export type InsertWorldState = typeof worldState.$inferInsert

export const completedTasks = sqliteTable(
  tableName('completed_tasks'),
  {
    id: text().primaryKey(),
    chapter: integer().notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
)
export type SelectCompletedTask = typeof completedTasks.$inferSelect
export type InsertCompletedTask = typeof completedTasks.$inferInsert

export const flowers = sqliteTable(
  tableName('flowers'),
  {
    id: text().primaryKey(),
    type: text().notNull(),
    x: real().notNull(),
    y: real().notNull(),
    pollinated: integer({ mode: 'boolean' }).notNull().default(false),
    fruiting: integer({ mode: 'boolean' }).notNull().default(false),
    nectarAmount: real('nectar_amount').notNull().default(1.0),
  },
)
export type SelectFlower = typeof flowers.$inferSelect
export type InsertFlower = typeof flowers.$inferInsert

export const nest = sqliteTable(
  tableName('nest'),
  {
    id: text().primaryKey().$defaultFn(() => 'main'),
    x: real(),
    y: real(),
    waxCells: integer('wax_cells').notNull().default(0),
    pollenStorage: real('pollen_storage').notNull().default(0),
    nectarStorage: real('nectar_storage').notNull().default(0),
    eggs: integer().notNull().default(0),
    larvae: integer().notNull().default(0),
    cocoons: integer().notNull().default(0),
    workers: integer().notNull().default(0),
    drones: integer().notNull().default(0),
    youngQueens: integer('young_queens').notNull().default(0),
    honeyPot: real('honey_pot').notNull().default(0),
  },
)
export type SelectNest = typeof nest.$inferSelect
export type InsertNest = typeof nest.$inferInsert
