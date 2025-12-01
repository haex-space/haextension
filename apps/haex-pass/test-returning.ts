// Test script to check if .returning() works with different data types
import { haexPasswordsItemSnapshots } from './app/database/schemas/index'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'

export async function testReturningAsync(orm: SqliteRemoteDatabase<any>) {
  console.log('=== Testing .returning() with different scenarios ===')

  const testId = 'test-' + crypto.randomUUID()
  const testItemId = 'test-item-' + crypto.randomUUID()

  // Test 1: Simple insert without .returning()
  console.log('\n[Test 1] Insert WITHOUT .returning()')
  try {
    await orm.insert(haexPasswordsItemSnapshots).values({
      id: testId + '-1',
      itemId: testItemId,
      snapshotData: '{"test":"simple"}',
      createdAt: new Date().toISOString(),
      modifiedAt: null,
    })
    console.log('✓ Success: Insert without .returning() works')
  } catch (err) {
    console.error('✗ Failed:', err)
  }

  // Test 2: Insert with .returning()
  console.log('\n[Test 2] Insert WITH .returning()')
  try {
    const result = await orm.insert(haexPasswordsItemSnapshots).values({
      id: testId + '-2',
      itemId: testItemId,
      snapshotData: '{"test":"with-returning"}',
      createdAt: new Date().toISOString(),
      modifiedAt: null,
    }).returning()
    console.log('✓ Success: Insert with .returning() works')
    console.log('  Returned:', result)
  } catch (err) {
    console.error('✗ Failed:', err)
  }

  // Test 3: Insert with complex JSON and .returning()
  console.log('\n[Test 3] Insert with complex JSON and .returning()')
  try {
    const complexJson = JSON.stringify({
      title: "Test Entry",
      username: "test@example.com",
      password: "secret123",
      url: "https://example.com",
      note: "Test note",
      tags: "tag1, tag2",
      otpSecret: null,
      keyValues: [
        { key: "Custom Field", value: "Custom Value" },
        { key: "Another Field", value: "123" }
      ]
    })

    const result = await orm.insert(haexPasswordsItemSnapshots).values({
      id: testId + '-3',
      itemId: testItemId,
      snapshotData: complexJson,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    }).returning()
    console.log('✓ Success: Complex JSON with .returning() works')
    console.log('  Returned:', result)
  } catch (err) {
    console.error('✗ Failed:', err)
  }

  // Test 4: Insert with special characters and .returning()
  console.log('\n[Test 4] Insert with special characters and .returning()')
  try {
    const specialJson = JSON.stringify({
      title: "enviam.mitarbeiterangebote.de",
      url: "cmd:// {GOOGLECHROME} http://www.example.com/?user={USERNAME}&pw={PASSWORD}",
      note: "Contains {curly} braces and 'quotes' and \"double quotes\"",
    })

    const result = await orm.insert(haexPasswordsItemSnapshots).values({
      id: testId + '-4',
      itemId: testItemId,
      snapshotData: specialJson,
      createdAt: new Date().toISOString(),
      modifiedAt: null,
    }).returning()
    console.log('✓ Success: Special chars with .returning() works')
    console.log('  Returned:', result)
  } catch (err) {
    console.error('✗ Failed:', err)
  }

  console.log('\n=== Test completed ===')
}
