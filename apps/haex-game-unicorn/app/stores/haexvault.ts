import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import * as schema from '~/database/schemas'

const migrationFiles = import.meta.glob('../database/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const useHaexVaultStore = defineStore('haexvault', () => {
  const nuxtApp = useNuxtApp()
  const isInitialized = ref(false)
  const orm = shallowRef<SqliteRemoteDatabase<typeof schema> | null>(null)

  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault
    if (!haexVault) {
      throw new Error('HaexVault plugin not available')
    }
    return haexVault
  }

  const runMigrationsAsync = async () => {
    const haexVault = getHaexVault()

    const migrations = Object.entries(migrationFiles)
      .map(([path, content]) => {
        const fileName = path.split('/').pop()?.replace('.sql', '') || ''
        return {
          name: fileName,
          sql: content as string,
        }
      })

    const result = await haexVault.client.registerMigrationsAsync(
      haexVault.client.extensionInfo!.version,
      migrations,
    )

    console.log(
      `[haex-game-unicorn] Migrations: ${result.appliedCount} applied, ${result.alreadyAppliedCount} already applied`,
    )
  }

  const initializeAsync = async () => {
    if (isInitialized.value) return

    const haexVault = getHaexVault()

    haexVault.client.onSetup(async () => {
      await runMigrationsAsync()
    })

    orm.value = haexVault.client.initializeDatabase(schema)

    await haexVault.client.setupComplete()

    isInitialized.value = true
  }

  return {
    get client() {
      return getHaexVault().client
    },
    orm,
    isInitialized,
    initializeAsync,
  }
})
