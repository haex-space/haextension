/**
 * Database exports for password manager
 *
 * Schema table names are now statically prefixed with the extension's public key
 * at import time using the manifest.json
 *
 * The actual Drizzle instance is created in the HaexHub SDK via initializeDatabase()
 * and accessed through useHaexVaultStore().db
 */

// Export all schema tables and types
export * from "./schemas"
