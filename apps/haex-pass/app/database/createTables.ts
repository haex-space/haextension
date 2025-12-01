import { getTableConfig } from 'drizzle-orm/sqlite-core'
import * as schema from './schemas'

/**
 * Creates all database tables for the password manager
 * Uses the HaexHub client to execute CREATE TABLE statements
 */
export async function createTablesAsync(client: any) {
  console.log('[haex-pass] Creating database tables...')

  // Get all table definitions from schema
  const tables = [
    { table: schema.haexPasswordsGroups, name: 'haexPasswordsGroups' },
    { table: schema.haexPasswordsItemDetails, name: 'haexPasswordsItemDetails' },
    { table: schema.haexPasswordsItemKeyValues, name: 'haexPasswordsItemKeyValues' },
    { table: schema.haexPasswordsGroupItems, name: 'haexPasswordsGroupItems' },
    { table: schema.haexPasswordsBinaries, name: 'haexPasswordsBinaries' },
    { table: schema.haexPasswordsItemBinaries, name: 'haexPasswordsItemBinaries' },
    { table: schema.haexPasswordsItemSnapshots, name: 'haexPasswordsItemSnapshots' },
    { table: schema.haexPasswordsSnapshotBinaries, name: 'haexPasswordsSnapshotBinaries' },
  ]

  try {
    for (const { table, name } of tables) {
      const config = getTableConfig(table)
      const tableName = config.name

      console.log(`[haex-pass] Creating table: ${name} -> "${tableName}"`)

      // Build column definitions
      const columns: string[] = []

      for (const column of config.columns) {
        let colDef = `"${column.name}" ${column.getSQLType()}`

        if (column.primary) {
          colDef += ' PRIMARY KEY'
        }
        if (column.notNull) {
          colDef += ' NOT NULL'
        }
        if (column.default !== undefined) {
          colDef += ` DEFAULT ${column.default}`
        }

        columns.push(colDef)
      }

      // Build primary key constraint if composite
      if (config.primaryKeys && config.primaryKeys.length > 0 && config.primaryKeys[0]) {
        const pkCols = config.primaryKeys[0].columns.map(col => `"${col.name}"`).join(', ')
        columns.push(`PRIMARY KEY (${pkCols})`)
      }

      const createTableSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columns.join(', ')})`

      console.log(`[haex-pass] SQL:`, createTableSQL)

      try {
        await client.execute(createTableSQL, [])
        console.log(`[haex-pass] ✓ Table ${name} created/verified`)
      } catch (error) {
        console.error(`[haex-pass] ✗ Failed to create table ${name}:`, error)
      }
    }

    console.log('[haex-pass] All tables created successfully')
  } catch (error) {
    console.error('[haex-pass] Error creating tables:', error)
    throw error
  }
}
