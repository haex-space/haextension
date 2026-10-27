import type { LibraryItem } from '~/types/puzzle'
import type { LibraryBackend } from './library'
import { insertParams, listRowToItem, openRowToPicture, statements, type ListRow, type OpenRow } from './pictureRows'

/** The part of the SDK's `client.database` the library uses. */
export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>
}

/** The library in the vault's database: one statement per insert, one per removal, so rows are never half there. */
export function createVaultBackend(database: DatabaseClient, table: string): LibraryBackend {
  const sql = statements(table)

  return {
    async list() {
      const rows = await database.query<ListRow>(sql.list)
      return rows.map(listRowToItem)
    },

    async find(id): Promise<LibraryItem | null> {
      const [row] = await database.query<ListRow>(sql.find, [id])
      return row ? listRowToItem(row) : null
    },

    async insert(record) {
      const { rowsAffected } = await database.execute(sql.insert, insertParams(record))
      return rowsAffected > 0
    },

    async read(id) {
      const [row] = await database.query<OpenRow>(sql.open, [id])
      return row ? openRowToPicture(row) : null
    },

    async remove(ids) {
      await database.execute(sql.remove(ids.length), [...ids])
    },
  }
}
