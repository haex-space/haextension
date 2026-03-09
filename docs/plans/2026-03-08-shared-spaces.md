# Shared Spaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable multiple haex-vault users with separate accounts to share encrypted data via Shared Spaces, with federation support (spaces can live on any sync server) and capability-based access tokens (no account needed on foreign servers).

**Architecture:** A Shared Space is a shared data partition on a sync server with its own AES-256 encryption key. Each space has its own tables, managed by extensions. The space key is distributed asymmetrically via ECDH (encrypted with each member's public key). Every record is signed by the writing user's ECDSA P-256 key for authenticity. Record ownership is enforced server-side: only the record creator can modify their records (unless marked collaborative). Federation works via scoped access tokens bound to a public key – no account needed on foreign servers.

**Tech Stack:**
- Server: Bun + Hono + PostgreSQL + Drizzle (haex-sync-server)
- SDK: TypeScript, WebCrypto API (haex-vault-sdk)
- Client: Nuxt 3 + Tauri + Pinia (haex-vault)

**Key Repositories:**
- `/home/haex/Projekte/haex-sync-server/` – Sync server
- `/home/haex/Projekte/haex-vault-sdk/` – SDK (npm: @haex-space/vault-sdk)
- `/home/haex/Projekte/haex-vault/` – Vault client (desktop/mobile app)

---

## Core Concepts

### What is a Shared Space?
A shared space is an **isolated data partition** on a sync server with:
- Its own encryption key (AES-256, shared among members via ECDH)
- Its own tables (defined by extensions that support shared spaces)
- Its own membership (admin/member/viewer roles)
- Record-level ownership (each record tracks who created it)

### Extension Support Required
Extensions must explicitly support shared spaces. A shared space without an extension is an empty partition. The extension:
1. Defines which tables can live in a space
2. Creates tables in the space namespace
3. Provides UI for viewing/editing shared data
4. Handles business logic (what to share, how to display)

### Record Ownership Model
- `record_owner` is set by the **server** on first INSERT (= authenticated user's public key)
- `record_owner` is **immutable** – cannot be changed by anyone
- `collaborative` flag can only be changed by the record owner
- Default: only the record owner can modify/delete their records
- `collaborative = true`: any member can modify the record

### Roles
| Role | Read | Create Records | Modify Own | Modify Collaborative | Manage Members | Delete Space |
|------|------|---------------|------------|---------------------|---------------|-------------|
| viewer | yes | no | no | no | no | no |
| member | yes | yes | yes | yes | no | no |
| admin | yes | yes | yes | yes | yes | yes |

### Federation
- Spaces can live on any sync server
- Invited users get a scoped **access token** bound to their public key
- Token grants access to exactly one space with a specific role
- No account needed on the foreign server
- Token can be revoked by space admin or server admin

### Data Safety
- Deleting a space on the server **never** deletes local data
- Client receives 404 → marks space as "unavailable"
- User can migrate local data to personal vault or new space
- Leaving a space keeps a local snapshot of all data at time of leaving

### Atomic Push
- Space pushes are all-or-nothing
- If any change fails validation (bad signature, ownership violation), the entire push is rejected
- Client gets error with details about the first invalid change

---

## Overview

```
Phase 1: Server Foundation (haex-sync-server)
  Task 1:  User Keypairs – schema + endpoints
  Task 2:  Spaces, Members, Key Grants – schema + CRUD endpoints
  Task 3:  Space Access Tokens – federation auth bound to public key + role
  Task 4:  Space Sync Partitioning + RLS (role-based)
  Task 5:  Space-scoped Push with server-side validation

Phase 2: SDK Crypto & Types (haex-vault-sdk)
  Task 6:  User Keypair crypto (ECDSA P-256 + ECDH P-256)
  Task 7:  Space Key asymmetric encryption (ECDH key agreement)
  Task 8:  Record signing & verification
  Task 9:  SDK types & API methods

Phase 3: Vault Integration (haex-vault)
  Task 10: Keypair generation + registration
  Task 11: Space management store
  Task 12: Sync orchestrator – space-scoped sync
  Task 13: Space UI (create, invite, join, manage)
```

---

## Phase 1: Server Foundation (haex-sync-server)

### Task 1: User Keypairs – Schema & Endpoints

Users need an asymmetric keypair for:
- Receiving encrypted space keys (ECDH key agreement)
- Signing records they write (ECDSA signatures)

The keypair is generated client-side. Only the public key is stored in plaintext on the server. The private key is encrypted with the user's server password before upload.

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts`
- Create: `/home/haex/Projekte/haex-sync-server/src/routes/keypairs.ts`
- Modify: `/home/haex/Projekte/haex-sync-server/index.ts`
- Create: `/home/haex/Projekte/haex-sync-server/drizzle/rls-keypairs.sql`

**Step 1: Add userKeypairs table to schema**

In `src/db/schema.ts`, add:

```typescript
export const userKeypairs = pgTable('user_keypairs', {
  userId: uuid('user_id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),                // ECDSA P-256 public key (Base64 SPKI)
  encryptedPrivateKey: text('encrypted_private_key').notNull(), // AES-GCM encrypted (Base64)
  privateKeyNonce: text('private_key_nonce').notNull(),    // AES-GCM nonce (Base64)
  privateKeySalt: text('private_key_salt').notNull(),      // PBKDF2 salt (Base64)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type UserKeypair = typeof userKeypairs.$inferSelect
export type NewUserKeypair = typeof userKeypairs.$inferInsert
```

**Step 2: Generate migration**

```bash
cd /home/haex/Projekte/haex-sync-server
pnpm drizzle-kit generate
```

**Step 3: Create RLS policy**

Create `drizzle/rls-keypairs.sql`:

```sql
ALTER TABLE user_keypairs ENABLE ROW LEVEL SECURITY;

-- Anyone can read public keys (needed for inviting others)
CREATE POLICY user_keypairs_select ON user_keypairs
  FOR SELECT USING (true);

-- Users can only manage their own keypair
CREATE POLICY user_keypairs_insert ON user_keypairs
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_keypairs_update ON user_keypairs
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_keypairs_delete ON user_keypairs
  FOR DELETE USING (user_id = (SELECT auth.uid()));
```

**Step 4: Create keypairs route**

Create `src/routes/keypairs.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, userKeypairs } from '../db'
import { authMiddleware } from '../middleware/auth'
import { eq } from 'drizzle-orm'

const keypairs = new Hono()
keypairs.use('/*', authMiddleware)

const registerKeypairSchema = z.object({
  publicKey: z.string(),
  encryptedPrivateKey: z.string(),
  privateKeyNonce: z.string(),
  privateKeySalt: z.string(),
})

// Register keypair (one per user, idempotent)
keypairs.post('/', zValidator('json', registerKeypairSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  const existing = await db.select()
    .from(userKeypairs)
    .where(eq(userKeypairs.userId, user.userId))
    .limit(1)

  if (existing.length > 0) {
    return c.json({ error: 'Keypair already exists' }, 409)
  }

  await db.insert(userKeypairs).values({
    userId: user.userId,
    ...body,
  })

  return c.json({ success: true }, 201)
})

// Get own keypair (includes encrypted private key)
keypairs.get('/me', async (c) => {
  const user = c.get('user')
  const result = await db.select()
    .from(userKeypairs)
    .where(eq(userKeypairs.userId, user.userId))
    .limit(1)

  if (result.length === 0) {
    return c.json({ error: 'No keypair found' }, 404)
  }

  return c.json(result[0])
})

// Get another user's public key (for inviting)
keypairs.get('/public/:userId', async (c) => {
  const targetUserId = c.req.param('userId')
  const result = await db.select({
    userId: userKeypairs.userId,
    publicKey: userKeypairs.publicKey,
  })
    .from(userKeypairs)
    .where(eq(userKeypairs.userId, targetUserId))
    .limit(1)

  if (result.length === 0) {
    return c.json({ error: 'User has no keypair' }, 404)
  }

  return c.json(result[0])
})

export default keypairs
```

**Step 5: Mount route in index.ts**

```typescript
import keypairRoutes from './src/routes/keypairs'
app.route('/keypairs', keypairRoutes)
```

**Step 6: Apply migration + RLS**

```bash
pnpm db:push
psql $DATABASE_URL -f drizzle/rls-keypairs.sql
```

**Step 7: Commit**

```bash
git add src/db/schema.ts src/routes/keypairs.ts index.ts drizzle/rls-keypairs.sql
git commit -m "feat: add user keypairs table and endpoints"
```

---

### Task 2: Spaces, Members, Key Grants – Schema & CRUD Endpoints

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts`
- Create: `/home/haex/Projekte/haex-sync-server/src/routes/spaces.ts`
- Modify: `/home/haex/Projekte/haex-sync-server/index.ts`

**Step 1: Add tables to schema**

In `src/db/schema.ts`:

```typescript
import { ..., integer, boolean, primaryKey } from "drizzle-orm/pg-core"

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => authUsers.id),
  encryptedName: text('encrypted_name').notNull(),
  nameNonce: text('name_nonce').notNull(),
  currentKeyGeneration: integer('current_key_generation').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const spaceMembers = pgTable('space_members', {
  spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'admin' | 'member' | 'viewer'
  invitedBy: uuid('invited_by').references(() => authUsers.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.spaceId, table.userId] }),
}))

export const spaceKeyGrants = pgTable('space_key_grants', {
  spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  generation: integer('generation').notNull(),
  encryptedSpaceKey: text('encrypted_space_key').notNull(),
  keyNonce: text('key_nonce').notNull(),
  ephemeralPublicKey: text('ephemeral_public_key').notNull(),
  grantedBy: uuid('granted_by').references(() => authUsers.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.spaceId, table.userId, table.generation] }),
}))

export type Space = typeof spaces.$inferSelect
export type SpaceMember = typeof spaceMembers.$inferSelect
export type SpaceKeyGrant = typeof spaceKeyGrants.$inferSelect
```

**Step 2: Create spaces route**

Create `src/routes/spaces.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, spaces, spaceMembers, spaceKeyGrants } from '../db'
import { authMiddleware } from '../middleware/auth'
import { eq, and } from 'drizzle-orm'

const spacesRouter = new Hono()
spacesRouter.use('/*', authMiddleware)

// --- Helper: check caller's role in space ---
async function getCallerRole(spaceId: string, userId: string): Promise<string | null> {
  const result = await db.select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .limit(1)
  return result[0]?.role ?? null
}

// --- Create space ---
const createSpaceSchema = z.object({
  id: z.string().uuid(),
  encryptedName: z.string(),
  nameNonce: z.string(),
  keyGrant: z.object({
    encryptedSpaceKey: z.string(),
    keyNonce: z.string(),
    ephemeralPublicKey: z.string(),
  }),
})

spacesRouter.post('/', zValidator('json', createSpaceSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  await db.transaction(async (tx) => {
    await tx.insert(spaces).values({
      id: body.id,
      ownerId: user.userId,
      encryptedName: body.encryptedName,
      nameNonce: body.nameNonce,
    })

    await tx.insert(spaceMembers).values({
      spaceId: body.id,
      userId: user.userId,
      role: 'admin',
      invitedBy: user.userId,
    })

    await tx.insert(spaceKeyGrants).values({
      spaceId: body.id,
      userId: user.userId,
      generation: 1,
      encryptedSpaceKey: body.keyGrant.encryptedSpaceKey,
      keyNonce: body.keyGrant.keyNonce,
      ephemeralPublicKey: body.keyGrant.ephemeralPublicKey,
      grantedBy: user.userId,
    })
  })

  return c.json({ success: true, spaceId: body.id }, 201)
})

// --- List my spaces ---
spacesRouter.get('/', async (c) => {
  const user = c.get('user')
  const result = await db.select({ space: spaces, membership: spaceMembers })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(eq(spaceMembers.userId, user.userId))

  return c.json(result.map(r => ({
    ...r.space,
    role: r.membership.role,
    joinedAt: r.membership.joinedAt,
  })))
})

// --- Get space details (members only) ---
spacesRouter.get('/:spaceId', async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const role = await getCallerRole(spaceId, user.userId)
  if (!role) return c.json({ error: 'Not a member' }, 403)

  const space = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1)
  const members = await db.select({
    userId: spaceMembers.userId,
    role: spaceMembers.role,
    joinedAt: spaceMembers.joinedAt,
  }).from(spaceMembers).where(eq(spaceMembers.spaceId, spaceId))

  return c.json({ ...space[0], members })
})

// --- Delete space (admin only) ---
spacesRouter.delete('/:spaceId', async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const role = await getCallerRole(spaceId, user.userId)
  if (role !== 'admin') return c.json({ error: 'Only admins can delete a space' }, 403)

  await db.delete(spaces).where(eq(spaces.id, spaceId)) // CASCADE deletes members, grants, tokens
  return c.json({ success: true })
})

// --- Invite member (admin only) ---
const inviteMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
  keyGrant: z.object({
    encryptedSpaceKey: z.string(),
    keyNonce: z.string(),
    ephemeralPublicKey: z.string(),
    generation: z.number().int().positive(),
  }),
})

spacesRouter.post('/:spaceId/members', zValidator('json', inviteMemberSchema), async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const body = c.req.valid('json')

  const callerRole = await getCallerRole(spaceId, user.userId)
  if (callerRole !== 'admin') return c.json({ error: 'Only admins can invite' }, 403)

  const existing = await db.select().from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, body.userId)))
    .limit(1)
  if (existing.length > 0) return c.json({ error: 'Already a member' }, 409)

  await db.transaction(async (tx) => {
    await tx.insert(spaceMembers).values({
      spaceId, userId: body.userId, role: body.role, invitedBy: user.userId,
    })
    await tx.insert(spaceKeyGrants).values({
      spaceId, userId: body.userId,
      generation: body.keyGrant.generation,
      encryptedSpaceKey: body.keyGrant.encryptedSpaceKey,
      keyNonce: body.keyGrant.keyNonce,
      ephemeralPublicKey: body.keyGrant.ephemeralPublicKey,
      grantedBy: user.userId,
    })
  })

  return c.json({ success: true }, 201)
})

// --- Remove member (admin, or self-leave) ---
spacesRouter.delete('/:spaceId/members/:userId', async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const targetUserId = c.req.param('userId')
  const isSelfLeave = user.userId === targetUserId

  if (!isSelfLeave) {
    const callerRole = await getCallerRole(spaceId, user.userId)
    if (callerRole !== 'admin') return c.json({ error: 'Only admins can remove members' }, 403)
  }

  // Last admin cannot leave (must delete space or promote someone)
  const targetRole = await getCallerRole(spaceId, targetUserId)
  if (targetRole === 'admin') {
    const adminCount = await db.select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.role, 'admin')))
    if (adminCount.length <= 1) {
      return c.json({ error: 'Last admin cannot leave. Delete space or promote another admin.' }, 400)
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(spaceMembers).where(and(
      eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetUserId),
    ))
    await tx.delete(spaceKeyGrants).where(and(
      eq(spaceKeyGrants.spaceId, spaceId), eq(spaceKeyGrants.userId, targetUserId),
    ))
  })

  return c.json({ success: true })
})

// --- Get my key grants for a space ---
spacesRouter.get('/:spaceId/key-grants', async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const grants = await db.select().from(spaceKeyGrants)
    .where(and(eq(spaceKeyGrants.spaceId, spaceId), eq(spaceKeyGrants.userId, user.userId)))
  return c.json(grants)
})

export default spacesRouter
```

**Step 3: Mount route + generate migration + commit**

```bash
# Add to index.ts:
# import spacesRoutes from './src/routes/spaces'
# app.route('/spaces', spacesRoutes)

pnpm drizzle-kit generate && pnpm db:push
git add -A
git commit -m "feat: add spaces, members, key grants tables and CRUD endpoints"
```

---

### Task 3: Space Access Tokens – Federation Auth

Tokens are scoped to one space, bound to a public key, and carry a role. This ensures:
- Stolen token + wrong private key = server rejects (signature mismatch)
- Viewer token = no writes allowed
- Revoked token = immediate access loss

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts`
- Create: `/home/haex/Projekte/haex-sync-server/src/middleware/spaceTokenAuth.ts`
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/spaces.ts`

**Step 1: Add spaceAccessTokens table**

In `src/db/schema.ts`:

```typescript
export const spaceAccessTokens = pgTable('space_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  publicKey: text('public_key').notNull(),       // Bound to this user's public key
  role: text('role').notNull(),                   // 'admin' | 'member' | 'viewer'
  label: text('label'),
  issuedBy: uuid('issued_by').references(() => authUsers.id),
  revoked: boolean('revoked').notNull().default(false),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: text('revoked_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

export type SpaceAccessToken = typeof spaceAccessTokens.$inferSelect
```

**Step 2: Create space token auth middleware**

Create `src/middleware/spaceTokenAuth.ts`:

```typescript
import { createMiddleware } from 'hono/factory'
import { db, spaceAccessTokens } from '../db'
import { eq, and } from 'drizzle-orm'

export interface SpaceTokenContext {
  spaceId: string
  tokenId: string
  publicKey: string
  role: string
  isSpaceToken: true
}

declare module 'hono' {
  interface ContextVariableMap {
    spaceToken: SpaceTokenContext | null
  }
}

export const spaceTokenAuthMiddleware = createMiddleware(async (c, next) => {
  const spaceToken = c.req.header('X-Space-Token')

  if (!spaceToken) {
    c.set('spaceToken', null)
    return next()
  }

  const result = await db.select()
    .from(spaceAccessTokens)
    .where(and(
      eq(spaceAccessTokens.token, spaceToken),
      eq(spaceAccessTokens.revoked, false),
    ))
    .limit(1)

  if (result.length === 0) {
    return c.json({ error: 'Invalid or revoked space token' }, 401)
  }

  const tokenRecord = result[0]

  // Update last used (fire-and-forget)
  db.update(spaceAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(spaceAccessTokens.id, tokenRecord.id))
    .then(() => {})

  c.set('spaceToken', {
    spaceId: tokenRecord.spaceId,
    tokenId: tokenRecord.id,
    publicKey: tokenRecord.publicKey,
    role: tokenRecord.role,
    isSpaceToken: true,
  })

  return next()
})
```

**Step 3: Add token management endpoints to spaces.ts**

```typescript
import { randomBytes } from 'crypto'
import { spaceAccessTokens } from '../db'

// Create access token (admin only)
const createTokenSchema = z.object({
  publicKey: z.string(),                // Recipient's public key (token bound to this key)
  role: z.enum(['admin', 'member', 'viewer']),
  label: z.string().optional(),
})

spacesRouter.post('/:spaceId/tokens', zValidator('json', createTokenSchema), async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const body = c.req.valid('json')

  const callerRole = await getCallerRole(spaceId, user.userId)
  if (callerRole !== 'admin') return c.json({ error: 'Only admins can create tokens' }, 403)

  const token = randomBytes(32).toString('hex')
  const [created] = await db.insert(spaceAccessTokens).values({
    spaceId, token,
    publicKey: body.publicKey,
    role: body.role,
    label: body.label,
    issuedBy: user.userId,
  }).returning()

  // Token is only returned ONCE at creation time
  return c.json({ tokenId: created.id, token }, 201)
})

// List tokens (admin only, never returns token value)
spacesRouter.get('/:spaceId/tokens', async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const callerRole = await getCallerRole(spaceId, user.userId)
  if (callerRole !== 'admin') return c.json({ error: 'Insufficient permissions' }, 403)

  const tokens = await db.select({
    id: spaceAccessTokens.id,
    publicKey: spaceAccessTokens.publicKey,
    role: spaceAccessTokens.role,
    label: spaceAccessTokens.label,
    revoked: spaceAccessTokens.revoked,
    createdAt: spaceAccessTokens.createdAt,
    lastUsedAt: spaceAccessTokens.lastUsedAt,
  }).from(spaceAccessTokens).where(eq(spaceAccessTokens.spaceId, spaceId))

  return c.json(tokens)
})

// Revoke token (admin only)
spacesRouter.delete('/:spaceId/tokens/:tokenId', async (c) => {
  const user = c.get('user')
  const spaceId = c.req.param('spaceId')
  const tokenId = c.req.param('tokenId')

  const callerRole = await getCallerRole(spaceId, user.userId)
  if (callerRole !== 'admin') return c.json({ error: 'Insufficient permissions' }, 403)

  await db.update(spaceAccessTokens)
    .set({ revoked: true, revokedAt: new Date(), revokedBy: user.userId })
    .where(and(eq(spaceAccessTokens.id, tokenId), eq(spaceAccessTokens.spaceId, spaceId)))

  return c.json({ success: true })
})
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add space access tokens with public key binding and role"
```

---

### Task 4: Space Sync Partitioning + RLS

Spaces get their own sync_changes partitions with role-based RLS.

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/drizzle/partitioning.sql`

**Step 1: Add space partition auto-creation**

```sql
-- Auto-create partition when a space is created
CREATE OR REPLACE FUNCTION create_space_partition()
RETURNS TRIGGER AS $$
DECLARE
  partition_name TEXT;
  safe_space_id TEXT;
BEGIN
  safe_space_id := replace(NEW.id::text, '-', '_');
  partition_name := 'sync_changes_space_' || safe_space_id;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF sync_changes FOR VALUES IN (%L)',
    partition_name, NEW.id::text
  );

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);

  -- SELECT: any space member can read
  EXECUTE format(
    'CREATE POLICY space_select ON %I FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM space_members
        WHERE space_id = %L AND user_id = (SELECT auth.uid())
      )
    )', partition_name, NEW.id::text
  );

  -- INSERT: member or admin can write
  EXECUTE format(
    'CREATE POLICY space_insert ON %I FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM space_members
        WHERE space_id = %L AND user_id = (SELECT auth.uid())
        AND role IN (''member'', ''admin'')
      )
    )', partition_name, NEW.id::text
  );

  -- UPDATE: member or admin can update (record ownership checked at application level)
  EXECUTE format(
    'CREATE POLICY space_update ON %I FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM space_members
        WHERE space_id = %L AND user_id = (SELECT auth.uid())
        AND role IN (''member'', ''admin'')
      )
    )', partition_name, NEW.id::text
  );

  EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', partition_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_space_partition_trigger
  AFTER INSERT ON spaces
  FOR EACH ROW
  EXECUTE FUNCTION create_space_partition();

-- Auto-drop partition when space is deleted
CREATE OR REPLACE FUNCTION drop_space_partition()
RETURNS TRIGGER AS $$
DECLARE
  partition_name TEXT;
BEGIN
  partition_name := 'sync_changes_space_' || replace(OLD.id::text, '-', '_');
  EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER drop_space_partition_trigger
  BEFORE DELETE ON spaces
  FOR EACH ROW
  EXECUTE FUNCTION drop_space_partition();
```

**Step 2: Apply + commit**

```bash
psql $DATABASE_URL -f drizzle/partitioning.sql
git add -A
git commit -m "feat: add auto-partitioning with role-based RLS for spaces"
```

---

### Task 5: Space-Scoped Push with Server-Side Validation

The push endpoint for spaces must validate every change:
1. Signature present and valid
2. `signed_by` matches authenticated user (JWT or token public key)
3. Record ownership enforced (new records: server sets owner; updates: only owner or collaborative)
4. Role check (viewer cannot write)
5. Atomic: all changes pass or entire push rejected

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts` (add signature columns)
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/sync.ts`
- Modify: `/home/haex/Projekte/haex-sync-server/src/middleware/auth.ts` (skip when space token present)

**Step 1: Add columns to sync_changes**

In `src/db/schema.ts`, add to syncChanges:

```typescript
// Space-specific metadata (unencrypted, for server-side validation)
signature: text('signature'),         // ECDSA P-256 signature (Base64)
signedBy: text('signed_by'),         // Public key of signer (Base64 SPKI)
recordOwner: text('record_owner'),   // Public key of record creator (set by server, immutable)
collaborative: boolean('collaborative').default(false), // Can others modify this record?
```

**Step 2: Add space validation to push endpoint**

In `src/routes/sync.ts`, add validation logic for space pushes:

```typescript
import { spaceMembers, spaceAccessTokens } from '../db'
import { spaceTokenAuthMiddleware } from '../middleware/spaceTokenAuth'
import { verifyRecordSignatureAsync } from '@haex-space/vault-sdk'

// Apply space token middleware to sync routes
sync.use('/*', spaceTokenAuthMiddleware)

// In the push handler, before processing changes:
async function validateSpacePush(
  changes: PushChange[],
  spaceId: string,
  authenticatedPublicKey: string,
  role: string,
): Promise<{ valid: boolean; error?: string }> {

  // 1. Role check
  if (role === 'viewer') {
    return { valid: false, error: 'Viewers cannot push changes' }
  }

  for (const change of changes) {
    // 2. Signature required
    if (!change.signature || !change.signedBy) {
      return { valid: false, error: `Change for ${change.tableName}/${change.rowPks} missing signature` }
    }

    // 3. signedBy must match authenticated user
    if (change.signedBy !== authenticatedPublicKey) {
      return { valid: false, error: `signedBy does not match authenticated user` }
    }

    // 4. Verify signature cryptographically
    const isValid = await verifyRecordSignatureAsync(
      { tableName: change.tableName, rowPks: change.rowPks,
        columnName: change.columnName, encryptedValue: change.encryptedValue,
        hlcTimestamp: change.hlcTimestamp },
      change.signature,
      change.signedBy,
    )
    if (!isValid) {
      return { valid: false, error: `Invalid signature for ${change.tableName}/${change.rowPks}` }
    }

    // 5. Record ownership check
    const existingRecord = await db.select({
      recordOwner: syncChanges.recordOwner,
      collaborative: syncChanges.collaborative,
    }).from(syncChanges)
      .where(and(
        eq(syncChanges.vaultId, spaceId),
        eq(syncChanges.tableName, change.tableName),
        eq(syncChanges.rowPks, change.rowPks),
      ))
      .limit(1)

    if (existingRecord.length === 0) {
      // New record: server will set record_owner = signedBy
      change.recordOwner = change.signedBy
    } else {
      const existing = existingRecord[0]

      // Cannot change record_owner
      if (change.recordOwner && change.recordOwner !== existing.recordOwner) {
        return { valid: false, error: `Cannot change record_owner for ${change.rowPks}` }
      }
      change.recordOwner = existing.recordOwner

      // collaborative flag: only owner can change
      if (change.collaborative !== undefined && change.collaborative !== existing.collaborative) {
        if (change.signedBy !== existing.recordOwner) {
          return { valid: false, error: `Only record owner can change collaborative flag` }
        }
      }

      // Data modification: only owner or collaborative
      if (change.encryptedValue !== undefined) {
        const isOwner = change.signedBy === existing.recordOwner
        const isCollaborative = existing.collaborative === true
        if (!isOwner && !isCollaborative) {
          return { valid: false, error: `Cannot modify record owned by ${existing.recordOwner}` }
        }
      }
    }
  }

  return { valid: true }
}
```

**Step 3: Modify auth middleware to skip when space token present**

In `src/middleware/auth.ts`:

```typescript
// At the start of the middleware:
if (c.get('spaceToken')) {
  return next() // Space token already validated by spaceTokenAuthMiddleware
}
```

**Step 4: Wire up in push handler**

```typescript
// In the push handler:
const isSpaceSync = !!c.get('spaceToken') || await isSpacePartition(body.vaultId)

if (isSpaceSync) {
  const spaceToken = c.get('spaceToken')
  const authenticatedPublicKey = spaceToken
    ? spaceToken.publicKey
    : await getUserPublicKey(user.userId) // Lookup from user_keypairs
  const role = spaceToken
    ? spaceToken.role
    : await getCallerRole(body.vaultId, user.userId)

  if (!authenticatedPublicKey) {
    return c.json({ error: 'User has no registered keypair' }, 400)
  }
  if (!role) {
    return c.json({ error: 'Not a member of this space' }, 403)
  }

  const validation = await validateSpacePush(body.changes, body.vaultId, authenticatedPublicKey, role)
  if (!validation.valid) {
    return c.json({ error: validation.error }, 403)
  }
}

// ... proceed with existing UPSERT logic ...
// For space changes, include signature, signedBy, recordOwner, collaborative in the UPSERT
```

**Step 5: Token-auth push uses service role for DB access**

When a space token is used (no Supabase JWT), the server executes the DB operations using a service-role connection that bypasses RLS. The application-level validation above ensures safety.

**Step 6: Generate migration + commit**

```bash
pnpm drizzle-kit generate && pnpm db:push
git add -A
git commit -m "feat: space-scoped push with signature verification and record ownership enforcement"
```

---

## Phase 2: SDK Crypto & Types (haex-vault-sdk)

### Task 6: User Keypair Crypto (ECDSA P-256 + ECDH P-256)

ECDSA P-256 for signing records, ECDH P-256 for deriving shared secrets to encrypt space keys. Both use the same curve (P-256) and are fully WebCrypto-compatible.

**Files:**
- Create: `/home/haex/Projekte/haex-vault-sdk/src/crypto/userKeypair.ts`
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/index.ts`

**Step 1: Create userKeypair.ts**

```typescript
import { deriveKeyFromPassword, arrayBufferToBase64, base64ToArrayBuffer } from './vaultKey'

const SIGNING_ALGO = { name: 'ECDSA', namedCurve: 'P-256' }
const KEY_AGREEMENT_ALGO = { name: 'ECDH', namedCurve: 'P-256' }

export interface UserKeypair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export interface ExportedUserKeypair {
  publicKey: string   // Base64 SPKI
  privateKey: string  // Base64 PKCS8
}

export async function generateUserKeypairAsync(): Promise<UserKeypair> {
  const keypair = await crypto.subtle.generateKey(SIGNING_ALGO, true, ['sign', 'verify'])
  return { publicKey: keypair.publicKey, privateKey: keypair.privateKey }
}

export async function exportUserKeypairAsync(keypair: UserKeypair): Promise<ExportedUserKeypair> {
  const pub = await crypto.subtle.exportKey('spki', keypair.publicKey)
  const priv = await crypto.subtle.exportKey('pkcs8', keypair.privateKey)
  return { publicKey: arrayBufferToBase64(pub), privateKey: arrayBufferToBase64(priv) }
}

export async function importUserPublicKeyAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToArrayBuffer(base64), SIGNING_ALGO, true, ['verify'])
}

export async function importUserPrivateKeyAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', base64ToArrayBuffer(base64), SIGNING_ALGO, true, ['sign'])
}

export async function importPublicKeyForKeyAgreementAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToArrayBuffer(base64), KEY_AGREEMENT_ALGO, true, [])
}

export async function importPrivateKeyForKeyAgreementAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', base64ToArrayBuffer(base64), KEY_AGREEMENT_ALGO, true, ['deriveBits'])
}

export async function encryptPrivateKeyAsync(
  privateKeyBase64: string, password: string,
): Promise<{ encryptedPrivateKey: string; nonce: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derivedKey = await deriveKeyFromPassword(password, salt)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, derivedKey,
    new TextEncoder().encode(privateKeyBase64),
  )
  return {
    encryptedPrivateKey: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(nonce),
    salt: arrayBufferToBase64(salt),
  }
}

export async function decryptPrivateKeyAsync(
  encryptedPrivateKey: string, nonce: string, salt: string, password: string,
): Promise<string> {
  const derivedKey = await deriveKeyFromPassword(password, base64ToArrayBuffer(salt))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(nonce) }, derivedKey,
    base64ToArrayBuffer(encryptedPrivateKey),
  )
  return new TextDecoder().decode(decrypted)
}
```

**Step 2: Export from index.ts + commit**

```bash
git add -A
git commit -m "feat: add user keypair crypto (ECDSA/ECDH P-256)"
```

---

### Task 7: Space Key Asymmetric Encryption

ECDH key agreement to securely share the space AES-256 key with each member.

**Files:**
- Create: `/home/haex/Projekte/haex-vault-sdk/src/crypto/spaceKey.ts`
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/index.ts`

**Step 1: Create spaceKey.ts**

```typescript
import { importPublicKeyForKeyAgreementAsync, importPrivateKeyForKeyAgreementAsync } from './userKeypair'
import { arrayBufferToBase64, base64ToArrayBuffer, generateVaultKey } from './vaultKey'

const ECDH_ALGO = { name: 'ECDH', namedCurve: 'P-256' }

export interface EncryptedSpaceKey {
  encryptedSpaceKey: string
  keyNonce: string
  ephemeralPublicKey: string
}

export function generateSpaceKey(): Uint8Array {
  return generateVaultKey() // 32 random bytes
}

export async function encryptSpaceKeyForRecipientAsync(
  spaceKey: Uint8Array, recipientPublicKeyBase64: string,
): Promise<EncryptedSpaceKey> {
  const ephemeral = await crypto.subtle.generateKey(ECDH_ALGO, true, ['deriveBits'])
  const recipientKey = await importPublicKeyForKeyAgreementAsync(recipientPublicKeyBase64)

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientKey }, ephemeral.privateKey, 256,
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
      info: new TextEncoder().encode('haex-space-key') },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  )

  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, spaceKey)
  const ephPub = await crypto.subtle.exportKey('spki', ephemeral.publicKey)

  return {
    encryptedSpaceKey: arrayBufferToBase64(encrypted),
    keyNonce: arrayBufferToBase64(nonce),
    ephemeralPublicKey: arrayBufferToBase64(ephPub),
  }
}

export async function decryptSpaceKeyAsync(
  encrypted: EncryptedSpaceKey, ownPrivateKeyBase64: string,
): Promise<Uint8Array> {
  const ephPubKey = await crypto.subtle.importKey(
    'spki', base64ToArrayBuffer(encrypted.ephemeralPublicKey), ECDH_ALGO, true, [],
  )
  const ownPrivKey = await importPrivateKeyForKeyAgreementAsync(ownPrivateKeyBase64)

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephPubKey }, ownPrivKey, 256,
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
      info: new TextEncoder().encode('haex-space-key') },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(encrypted.keyNonce) },
    aesKey, base64ToArrayBuffer(encrypted.encryptedSpaceKey),
  )

  return new Uint8Array(decrypted)
}
```

**Step 2: Export + commit**

```bash
git add -A
git commit -m "feat: add ECDH space key encryption for key distribution"
```

---

### Task 8: Record Signing & Verification

Every sync change to a shared space is signed. Signature covers encrypted data (not plaintext) so verification doesn't require the space key.

**Files:**
- Create: `/home/haex/Projekte/haex-vault-sdk/src/crypto/recordSigning.ts`
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/index.ts`

**Step 1: Create recordSigning.ts**

```typescript
import { importUserPrivateKeyAsync, importUserPublicKeyAsync } from './userKeypair'
import { arrayBufferToBase64, base64ToArrayBuffer } from './vaultKey'

export interface SignableRecord {
  tableName: string
  rowPks: string
  columnName: string | null
  encryptedValue: string | null
  hlcTimestamp: string
}

function canonicalize(record: SignableRecord): Uint8Array {
  const parts = [
    record.tableName,
    record.rowPks,
    record.columnName ?? '',
    record.encryptedValue ?? '',
    record.hlcTimestamp,
  ].join('\0')
  return new TextEncoder().encode(parts)
}

export async function signRecordAsync(
  record: SignableRecord, privateKeyBase64: string,
): Promise<string> {
  const key = await importUserPrivateKeyAsync(privateKeyBase64)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, canonicalize(record))
  return arrayBufferToBase64(sig)
}

export async function verifyRecordSignatureAsync(
  record: SignableRecord, signatureBase64: string, publicKeyBase64: string,
): Promise<boolean> {
  const key = await importUserPublicKeyAsync(publicKeyBase64)
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key,
    base64ToArrayBuffer(signatureBase64), canonicalize(record),
  )
}
```

**Step 2: Export + commit**

```bash
git add -A
git commit -m "feat: add record signing and verification"
```

---

### Task 9: SDK Types & API Methods

**Files:**
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/types.ts`
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/api/syncServer.ts`

**Step 1: Add shared space types to types.ts**

```typescript
export type SpaceRole = 'admin' | 'member' | 'viewer'

export interface SharedSpace {
  id: string
  ownerId: string
  encryptedName: string
  nameNonce: string
  currentKeyGeneration: number
  role: SpaceRole
  createdAt: string
}

export interface SpaceMemberInfo {
  userId: string
  role: SpaceRole
  joinedAt: string
  publicKey?: string
}

export interface SpaceKeyGrantInfo {
  spaceId: string
  generation: number
  encryptedSpaceKey: string
  keyNonce: string
  ephemeralPublicKey: string
}

export interface SpaceInvite {
  spaceId: string
  serverUrl: string
  spaceName: string
  accessToken: string
  encryptedSpaceKey: string
  keyNonce: string
  ephemeralPublicKey: string
  generation: number
  role: SpaceRole
}

export interface SpaceAccessTokenInfo {
  id: string
  publicKey: string
  role: SpaceRole
  label: string | null
  revoked: boolean
  createdAt: string
  lastUsedAt: string | null
}
```

**Step 2: Add API request types to syncServer.ts**

```typescript
export interface CreateSpaceRequest {
  id: string
  encryptedName: string
  nameNonce: string
  keyGrant: { encryptedSpaceKey: string; keyNonce: string; ephemeralPublicKey: string }
}

export interface InviteMemberRequest {
  userId: string
  role: SpaceRole
  keyGrant: { encryptedSpaceKey: string; keyNonce: string; ephemeralPublicKey: string; generation: number }
}

export interface RegisterKeypairRequest {
  publicKey: string
  encryptedPrivateKey: string
  privateKeyNonce: string
  privateKeySalt: string
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add shared space types and API definitions"
```

---

## Phase 3: Vault Integration (haex-vault)

### Task 10: Keypair Generation + Registration

Generate user keypair during first sync setup and register on server.

**Files:**
- Create: `/home/haex/Projekte/haex-vault/src/stores/userKeypair.ts`
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/backends.ts`

Implementation: Pinia store that generates keypair, encrypts private key with server password, registers on server, and caches decrypted private key in memory. Triggered during initial sync backend setup.

**Commit:** `feat: add user keypair store with generation and registration`

---

### Task 11: Space Management Store

Manages creating/joining spaces, membership, and space key caching.

**Files:**
- Create: `/home/haex/Projekte/haex-vault/src/stores/spaces.ts`

Key operations:
- `createSpaceAsync()` – generate space key, encrypt name, create on server, create local sync backend
- `joinSpaceFromInviteAsync(invite)` – parse invite, add sync backend for foreign server with access token, decrypt space key
- `listSpacesAsync()` – list from all sync backends
- `inviteMemberAsync()` – lookup public key, encrypt space key via ECDH, create token, create invite payload
- `leaveSpaceAsync()` – remove local sync backend, keep local data
- Space key cache in memory (keyed by spaceId + generation)

**Commit:** `feat: add space management store`

---

### Task 12: Sync Orchestrator – Space-Scoped Sync

**CRITICAL**: Personal backends only sync personal tables. Space backends only sync space tables.

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/database/schemas/haex.ts`
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/orchestrator/push.ts`
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/orchestrator/pull.ts`

Key changes:
1. Add `type` ('personal' | 'space') and `spaceId` to `haexSyncBackends` schema
2. Add `spaceToken` field for federation auth
3. Push: filter dirty tables by backend type
   - Personal backend: exclude all space-namespaced tables
   - Space backend: include ONLY tables for this spaceId
4. Push to space backend: sign each change with user's private key, use space key for encryption
5. Push to space backend on foreign server: use `X-Space-Token` header instead of Bearer JWT
6. Pull from space backend: verify signatures, decrypt with space key
7. Pull: on 404 (space deleted on server) → mark backend as unavailable, NEVER delete local data

**Commit:** `feat: space-scoped sync in orchestrator with data isolation`

---

### Task 13: Space UI

**Files:**
- Create: `/home/haex/Projekte/haex-vault/src/pages/spaces/index.vue`
- Create: `/home/haex/Projekte/haex-vault/src/pages/spaces/[id].vue`
- Create: `/home/haex/Projekte/haex-vault/src/components/spaces/CreateSpaceDialog.vue`
- Create: `/home/haex/Projekte/haex-vault/src/components/spaces/InviteMemberDialog.vue`
- Create: `/home/haex/Projekte/haex-vault/src/components/spaces/JoinSpaceDialog.vue`
- Create: `/home/haex/Projekte/haex-vault/src/components/spaces/ManageTokensDialog.vue`

UI flows:
1. **Create Space**: Name → generates key → creates on server → shows invite option
2. **Invite Member**: Enter user ID or email → fetch public key → encrypt space key → create token → show QR/link with invite payload
3. **Join Space**: Scan QR / paste invite JSON → add space sync backend → start sync
4. **Space Details**: View members, roles, manage tokens, leave/delete space
5. **Token Management**: List tokens, revoke, create new

**Commit:** `feat: add space management UI`

---

## Architecture Decisions Record

### ADR-1: P-256 over Ed25519
ECDSA/ECDH P-256 is natively supported in WebCrypto across all platforms. Ed25519 WebCrypto support is newer. The SDK already uses P-256 for passkeys.

### ADR-2: Table-Level Sharing
Extensions define which tables live in a space. No row-level sharing (too complex, error-prone). This means an extension must explicitly support shared spaces.

### ADR-3: Token Auth Bound to Public Key + Role
Tokens are not bearer-only. Each token is bound to a specific public key and role. The server verifies that all pushed changes are signed by the token's public key. Stolen token without the matching private key is useless.

### ADR-4: Record Ownership Server-Enforced
`record_owner` is set by the server on first INSERT, not by the client. It is immutable. This prevents any client from claiming ownership of another user's record.

### ADR-5: Sign Encrypted Data
Signatures cover encrypted values (not plaintext). Verification doesn't require the space key. The server can verify signatures without decrypting data.

### ADR-6: Atomic Push for Spaces
All changes in a space push must pass validation, or the entire push is rejected. No partial accepts. Client gets clear error about what failed.

### ADR-7: Local Data Never Deleted on Server Events
When a space is deleted on the server, or a user is removed, or a token is revoked, the client's local data is never deleted. The sync backend is marked as unavailable. The user decides what to do with their local copy.

### ADR-8: Admin-Only Space Deletion
Only space admins can delete a space. Server admins can also delete any space (abuse, storage). Members and viewers can only leave.

---

## Testing Strategy

### Server (haex-sync-server)
- Keypair CRUD: register, fetch own, fetch other's public key
- Space CRUD: create, list, get details, delete
- Membership: invite, remove, self-leave, last-admin protection
- Tokens: create (bound to public key + role), list, revoke
- Push validation:
  - Missing signature → reject
  - Wrong signedBy → reject
  - Modify another user's record → reject
  - Modify collaborative record → accept
  - Viewer push → reject
  - Change record_owner → reject
  - Change collaborative by non-owner → reject
  - All valid → accept
  - One invalid in batch → entire push rejected (atomic)
- Partitioning: space partition auto-created/deleted

### SDK (haex-vault-sdk)
- Keypair generate → export → import roundtrip
- Space key encrypt → decrypt roundtrip (owner → recipient)
- Record sign → verify roundtrip
- Verify with wrong key → false
- Verify with tampered data → false

### Vault (haex-vault)
- Create space → sync backend created
- Join via invite → foreign sync backend created with token
- Push to space → only space tables synced
- Push to personal → no space tables synced
- Space deleted on server → local data preserved
- Token revoked → sync fails gracefully
