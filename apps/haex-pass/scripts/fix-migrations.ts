/**
 * Post-processing script for Drizzle migrations
 * Converts all CREATE TABLE statements to CREATE TABLE IF NOT EXISTS
 *
 * Run after: drizzle-kit generate
 */

import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const MIGRATIONS_DIR = join(import.meta.dirname, '../app/database/migrations')

async function fixMigrations() {
  const files = await readdir(MIGRATIONS_DIR)
  const sqlFiles = files.filter(f => f.endsWith('.sql'))

  let modified = 0

  for (const file of sqlFiles) {
    const filePath = join(MIGRATIONS_DIR, file)
    const content = await readFile(filePath, 'utf-8')

    // Replace CREATE TABLE with CREATE TABLE IF NOT EXISTS (case insensitive)
    // But skip if IF NOT EXISTS is already present
    const fixed = content.replace(
      /CREATE TABLE(?!\s+IF NOT EXISTS)/gi,
      'CREATE TABLE IF NOT EXISTS'
    )

    if (fixed !== content) {
      await writeFile(filePath, fixed, 'utf-8')
      console.log(`✓ Fixed: ${file}`)
      modified++
    }
  }

  if (modified === 0) {
    console.log('No migrations needed fixing.')
  } else {
    console.log(`\nFixed ${modified} migration file(s).`)
  }
}

fixMigrations().catch(console.error)
