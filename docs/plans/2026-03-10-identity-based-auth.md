# Identity-Based Auth & Unified Space Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Supabase email/password auth with DID-based identity auth. Unify personal sync and shared spaces into a single "Space" concept. Every vault syncs through spaces — personal sync is just a single-member space.

**Architecture:** Client authenticates via challenge-response (ECDSA P-256 signature). Server creates/maps Supabase users for RLS. Identity claims (email, name, etc.) are stored locally and selectively disclosed to servers on registration. Recovery via vault-password-encrypted private key backup on server.

**Tech Stack:** Hono (sync server), Drizzle ORM + PostgreSQL, Supabase Auth (shadow accounts), @haex-space/vault-sdk (crypto), Vue 3 + Pinia (vault client), SQLite + Drizzle (vault local DB)

---

## Overview

### Current State (being replaced)
- User creates account on sync server with **email + password** (Supabase Auth)
- Personal sync uses `type: 'personal'` backend with email/password credentials
- Shared spaces use `type: 'space'` backend with space tokens + identity
- Two parallel auth mechanisms (password-based + challenge-based)
- Identity exists locally but is only used for space signing

### Target State
- User creates **Identity** in vault (with optional claims: email, name, phone, etc.)
- Identity registers on sync server via **DID + public key + email verification**
- Auth is **challenge-response only** (sign nonce with private key)
- Server creates **shadow Supabase user** (for RLS, no password)
- **Everything is a Space** — personal sync = single-member space
- Server operator defines **registration requirements** (which claims to request)
- **Quota system** per user tier, checked on push
- **Recovery** via vault-password-encrypted private key stored on server

### Role Model
| Role | Read | Write | Invite/Kick | Delete Space | Quota |
|------|------|-------|-------------|--------------|-------|
| **Admin** (1x) | ✓ | ✓ | ✓ (anyone) | ✓ | trägt Verbrauch |
| **Owner** | ✓ | ✓ | ✓ (member/reader only) | ✗ | — |
| **Member** | ✓ | ✓ | ✗ | ✗ | — |
| **Reader** | ✓ | ✗ | ✗ | ✗ | — |

- Admin can transfer admin role (requires: old admin + new admin + server operator consent)
- If admin deletes account without transfer → space is deleted
- Owners cannot kick other owners (only admin can)

---

## Task 1: Identity Claims — Vault SDK + Local Storage

**Goal:** Extend identity with optional claims (email, name, phone, address) stored locally in the encrypted vault.

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/database/schemas/haex.ts` — add `haexIdentityClaims` table
- Modify: `/home/haex/Projekte/haex-vault/src/stores/identity.ts` — CRUD for claims
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/types.ts` — claim types
- Create: `/home/haex/Projekte/haex-vault-sdk/src/crypto/claims.ts` — sign claims for selective disclosure

### Step 1: Define claim types in vault-sdk

```typescript
// vault-sdk/src/types.ts — add:

export interface IdentityClaim {
  type: string        // 'email' | 'name' | 'phone' | 'address' | custom
  value: string
  verifiedAt?: string // ISO timestamp, set after server verification
  verifiedBy?: string // server URL that verified this claim
}

export interface ClaimRequirement {
  type: string
  required: boolean
  label?: string      // human-readable description, e.g. "Email für Verifikation"
}

export interface SignedClaimPresentation {
  did: string
  publicKey: string   // Base64 SPKI
  claims: Record<string, string>  // type → value (only approved claims)
  timestamp: string   // ISO timestamp
  signature: string   // ECDSA P-256 signature over canonical form
}
```

### Step 2: Create claim signing function in vault-sdk

```typescript
// vault-sdk/src/crypto/claims.ts

import { importUserPrivateKeyAsync, importUserPublicKeyAsync } from './userKeypair'

/**
 * Creates a signed claim presentation for selective disclosure.
 * The server can verify that the claims come from the identity holder.
 *
 * Canonical form for signing: did\0timestamp\0type1=value1\0type2=value2\0...
 * (claims sorted alphabetically by type)
 */
export async function signClaimPresentationAsync(
  did: string,
  publicKeyBase64: string,
  claims: Record<string, string>,
  privateKeyBase64: string,
): Promise<SignedClaimPresentation> {
  const timestamp = new Date().toISOString()

  const sortedEntries = Object.entries(claims).sort(([a], [b]) => a.localeCompare(b))
  const canonical = [did, timestamp, ...sortedEntries.map(([k, v]) => `${k}=${v}`)].join('\0')

  const privateKey = await importUserPrivateKeyAsync(privateKeyBase64)
  const data = new TextEncoder().encode(canonical)
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data,
  )

  return {
    did,
    publicKey: publicKeyBase64,
    claims,
    timestamp,
    signature: btoa(String.fromCharCode(...new Uint8Array(sig))),
  }
}

/**
 * Verifies a signed claim presentation.
 */
export async function verifyClaimPresentationAsync(
  presentation: SignedClaimPresentation,
): Promise<boolean> {
  const { did, publicKey, claims, timestamp, signature } = presentation

  const sortedEntries = Object.entries(claims).sort(([a], [b]) => a.localeCompare(b))
  const canonical = [did, timestamp, ...sortedEntries.map(([k, v]) => `${k}=${v}`)].join('\0')

  const pubKey = await importUserPublicKeyAsync(publicKey)
  const data = new TextEncoder().encode(canonical)
  const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0))

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    sigBytes,
    data,
  )
}
```

### Step 3: Export from vault-sdk index

```typescript
// vault-sdk/src/index.ts — add exports:
export { signClaimPresentationAsync, verifyClaimPresentationAsync } from './crypto/claims'
export type { IdentityClaim, ClaimRequirement, SignedClaimPresentation } from './types'
```

### Step 4: Add identity claims table to vault database schema

```typescript
// haex-vault/src/database/schemas/haex.ts — add:

export const haexIdentityClaims = sqliteTable('haex_identity_claims', {
  id: text('id').primaryKey(),
  identityId: text('identity_id').notNull().references(() => haexIdentities.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),       // 'email', 'name', 'phone', 'address', etc.
  value: text('value').notNull(),
  verifiedAt: text('verified_at'),    // ISO timestamp
  verifiedBy: text('verified_by'),    // server URL
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
})
```

### Step 5: Add claim CRUD to identity store

Extend `useIdentityStore` in `/home/haex/Projekte/haex-vault/src/stores/identity.ts`:

```typescript
// Add to identity store:

const addClaimAsync = async (identityId: string, type: string, value: string) => {
  const db = useVaultStore().currentVault?.drizzle
  if (!db) throw new Error('No vault open')
  const id = crypto.randomUUID()
  await db.insert(haexIdentityClaims).values({ id, identityId, type, value })
  return { id, identityId, type, value }
}

const getClaimsAsync = async (identityId: string) => {
  const db = useVaultStore().currentVault?.drizzle
  if (!db) return []
  return db.select().from(haexIdentityClaims).where(eq(haexIdentityClaims.identityId, identityId))
}

const updateClaimAsync = async (claimId: string, value: string) => {
  const db = useVaultStore().currentVault?.drizzle
  if (!db) throw new Error('No vault open')
  await db.update(haexIdentityClaims).set({ value }).where(eq(haexIdentityClaims.id, claimId))
}

const deleteClaimAsync = async (claimId: string) => {
  const db = useVaultStore().currentVault?.drizzle
  if (!db) throw new Error('No vault open')
  await db.delete(haexIdentityClaims).where(eq(haexIdentityClaims.id, claimId))
}

const markClaimVerifiedAsync = async (claimId: string, serverUrl: string) => {
  const db = useVaultStore().currentVault?.drizzle
  if (!db) throw new Error('No vault open')
  await db.update(haexIdentityClaims).set({
    verifiedAt: new Date().toISOString(),
    verifiedBy: serverUrl,
  }).where(eq(haexIdentityClaims.id, claimId))
}
```

### Step 6: Write migration for identity claims table

Create new migration file in `/home/haex/Projekte/haex-vault/src-tauri/database/migrations/` (next sequence number after existing migrations):

```sql
CREATE TABLE IF NOT EXISTS `haex_identity_claims` (
  `id` text PRIMARY KEY NOT NULL,
  `identity_id` text NOT NULL REFERENCES `haex_identities`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL,
  `value` text NOT NULL,
  `verified_at` text,
  `verified_by` text,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_identity_claims_identity` ON `haex_identity_claims` (`identity_id`);
```

### Step 7: Commit

```bash
git add -A
git commit -m "feat: add identity claims for selective disclosure"
```

---

## Task 2: Server — Challenge-Response Auth Endpoints

**Goal:** Add DID-based registration and challenge-response login to the sync server. Replace email/password auth with identity-based auth.

**Files:**
- Create: `/home/haex/Projekte/haex-sync-server/src/routes/identity-auth.ts` — new auth routes
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts` — new tables: `identities`, `identity_verifications`
- Modify: `/home/haex/Projekte/haex-sync-server/index.ts` — mount new routes
- Modify: `/home/haex/Projekte/haex-sync-server/src/middleware/auth.ts` — support new JWT source

### Step 1: Add server-side identity tables

```typescript
// haex-sync-server/src/db/schema.ts — add:

/**
 * Server-side identity registry.
 * Maps DID identities to Supabase shadow users.
 * The server stores the public key and verified claims, never the private key.
 */
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  did: text('did').notNull().unique(),                  // did:key:z...
  publicKey: text('public_key').notNull().unique(),     // ECDSA P-256, Base64 SPKI
  supabaseUserId: uuid('supabase_user_id')
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  email: text('email'),                                  // verified email (if provided)
  emailVerified: boolean('email_verified').notNull().default(false),
  tier: text('tier').notNull().default('free'),          // 'free', 'pro', etc.
  encryptedPrivateKey: text('encrypted_private_key'),    // vault-password-encrypted backup
  privateKeyNonce: text('private_key_nonce'),
  privateKeySalt: text('private_key_salt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Identity = typeof identities.$inferSelect
export type NewIdentity = typeof identities.$inferInsert

/**
 * Pending auth challenges.
 * Short-lived nonces for challenge-response auth.
 */
export const authChallenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  did: text('did').notNull(),
  nonce: text('nonce').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Tiers define storage quotas.
 * Server operator configures these.
 */
export const tiers = pgTable('tiers', {
  name: text('name').primaryKey(),                       // 'free', 'pro', 'enterprise'
  maxStorageBytes: text('max_storage_bytes').notNull(),   // bigint as text (JS safe)
  maxSpaces: integer('max_spaces').notNull().default(3),
  description: text('description'),
})
```

### Step 2: Create registration requirements endpoint

```typescript
// haex-sync-server/src/routes/identity-auth.ts

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db } from '../db'
import { identities, authChallenges, tiers } from '../db/schema'
import { supabaseAdmin } from '../utils/supabase'
import { verifyClaimPresentationAsync } from '@haex-space/vault-sdk'
import type { ClaimRequirement, SignedClaimPresentation } from '@haex-space/vault-sdk'

const app = new Hono()

/**
 * GET /identity-auth/requirements
 *
 * Returns what claims this server requires for registration.
 * No auth needed — this is a public endpoint.
 */
app.get('/requirements', async (c) => {
  const requirements: ClaimRequirement[] = [
    { type: 'email', required: true, label: 'Email address for verification' },
    { type: 'name', required: false, label: 'Display name' },
  ]

  return c.json({
    serverName: process.env.SERVER_NAME || 'HaexSpace Sync',
    requirements,
    supportedDIDMethods: ['did:key'],
  })
})
```

### Step 3: Create registration endpoint

```typescript
// Continue in identity-auth.ts:

/**
 * POST /identity-auth/register
 *
 * Register a new identity on this server.
 * Requires signed claim presentation with at least the required claims.
 *
 * Flow:
 * 1. Verify claim signature (proof of private key possession)
 * 2. Check email not already registered
 * 3. Create Supabase shadow user (no password)
 * 4. Store identity mapping
 * 5. Send verification email via Supabase
 * 6. Return { identityId, status: 'verification_pending' }
 */
app.post('/register', async (c) => {
  const body = await c.req.json<{
    presentation: SignedClaimPresentation
    encryptedPrivateKey?: string  // vault-password-encrypted backup
    privateKeyNonce?: string
    privateKeySalt?: string
  }>()

  const { presentation } = body

  // 1. Verify claim signature
  const valid = await verifyClaimPresentationAsync(presentation)
  if (!valid) {
    return c.json({ error: 'Invalid claim signature' }, 400)
  }

  // 2. Check presentation age (max 5 minutes)
  const presentationAge = Date.now() - new Date(presentation.timestamp).getTime()
  if (presentationAge > 5 * 60 * 1000) {
    return c.json({ error: 'Presentation expired' }, 400)
  }

  // 3. Check required claims
  const email = presentation.claims['email']
  if (!email) {
    return c.json({ error: 'Email claim required' }, 400)
  }

  // 4. Check if DID or email already registered
  const existing = await db.select().from(identities)
    .where(eq(identities.did, presentation.did))
    .limit(1)

  if (existing.length > 0) {
    return c.json({ error: 'Identity already registered' }, 409)
  }

  // 5. Create Supabase shadow user (random password, no login possible)
  const shadowPassword = randomBytes(32).toString('hex')
  const { data: supaUser, error: supaError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: shadowPassword,
    email_confirm: false,
  })

  if (supaError || !supaUser.user) {
    console.error('Failed to create shadow user:', supaError)
    return c.json({ error: 'Registration failed' }, 500)
  }

  // 6. Store identity
  const [identity] = await db.insert(identities).values({
    did: presentation.did,
    publicKey: presentation.publicKey,
    supabaseUserId: supaUser.user.id,
    email,
    encryptedPrivateKey: body.encryptedPrivateKey,
    privateKeyNonce: body.privateKeyNonce,
    privateKeySalt: body.privateKeySalt,
  }).returning()

  // 7. Send verification email
  // Supabase handles this via the createUser email_confirm: false setting
  // The user needs to click the verification link
  const { error: emailError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email,
  })

  if (emailError) {
    console.error('Failed to send verification email:', emailError)
    // Don't fail registration — user can request re-send
  }

  return c.json({
    identityId: identity.id,
    status: 'verification_pending',
    message: 'Check your email to verify your identity',
  }, 201)
})
```

### Step 4: Create email verification callback

```typescript
// Continue in identity-auth.ts:

/**
 * POST /identity-auth/verify-email
 *
 * Called after user clicks verification link.
 * Supabase redirects to this endpoint with a token.
 */
app.post('/verify-email', async (c) => {
  const { token } = await c.req.json<{ token: string }>()

  // Verify the token via Supabase
  const { data, error } = await supabaseAdmin.auth.verifyOtp({
    token_hash: token,
    type: 'email',
  })

  if (error || !data.user) {
    return c.json({ error: 'Invalid or expired verification token' }, 400)
  }

  // Mark identity as verified
  await db.update(identities)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(identities.supabaseUserId, data.user.id))

  return c.json({ status: 'verified' })
})

/**
 * POST /identity-auth/resend-verification
 *
 * Resend verification email for an unverified identity.
 */
app.post('/resend-verification', async (c) => {
  const { did } = await c.req.json<{ did: string }>()

  const [identity] = await db.select().from(identities)
    .where(eq(identities.did, did))
    .limit(1)

  if (!identity || !identity.email) {
    return c.json({ error: 'Identity not found' }, 404)
  }

  if (identity.emailVerified) {
    return c.json({ error: 'Already verified' }, 400)
  }

  await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email: identity.email,
  })

  return c.json({ status: 'verification_sent' })
})
```

### Step 5: Create challenge-response login

```typescript
// Continue in identity-auth.ts:

/**
 * POST /identity-auth/challenge
 *
 * Request a challenge nonce for login.
 * Returns a random nonce that must be signed with the identity's private key.
 */
app.post('/challenge', async (c) => {
  const { did } = await c.req.json<{ did: string }>()

  // Check identity exists and is verified
  const [identity] = await db.select().from(identities)
    .where(eq(identities.did, did))
    .limit(1)

  if (!identity) {
    return c.json({ error: 'Identity not registered' }, 404)
  }

  if (!identity.emailVerified) {
    return c.json({ error: 'Email not verified', status: 'verification_pending' }, 403)
  }

  // Generate challenge nonce (32 bytes, hex)
  const nonce = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 1000) // 60 seconds

  // Clean up old challenges for this DID
  await db.delete(authChallenges)
    .where(eq(authChallenges.did, did))

  await db.insert(authChallenges).values({
    did,
    nonce,
    expiresAt,
  })

  return c.json({ nonce, expiresAt: expiresAt.toISOString() })
})

/**
 * POST /identity-auth/verify
 *
 * Verify the signed challenge and issue a JWT.
 *
 * The JWT is a Supabase-compatible token for the shadow user,
 * so all existing RLS policies continue to work.
 */
app.post('/verify', async (c) => {
  const { did, nonce, signature } = await c.req.json<{
    did: string
    nonce: string
    signature: string // Base64
  }>()

  // 1. Find and validate challenge
  const [challenge] = await db.select().from(authChallenges)
    .where(and(
      eq(authChallenges.did, did),
      eq(authChallenges.nonce, nonce),
    ))
    .limit(1)

  if (!challenge) {
    return c.json({ error: 'Invalid challenge' }, 400)
  }

  if (challenge.usedAt) {
    return c.json({ error: 'Challenge already used' }, 400)
  }

  if (new Date() > challenge.expiresAt) {
    return c.json({ error: 'Challenge expired' }, 400)
  }

  // 2. Find identity
  const [identity] = await db.select().from(identities)
    .where(eq(identities.did, did))
    .limit(1)

  if (!identity || !identity.supabaseUserId) {
    return c.json({ error: 'Identity not found' }, 404)
  }

  // 3. Verify signature
  // Import public key and verify nonce was signed by this identity
  const { importUserPublicKeyAsync } = await import('@haex-space/vault-sdk')
  const publicKey = await importUserPublicKeyAsync(identity.publicKey)
  const data = new TextEncoder().encode(nonce)
  const sigBytes = Uint8Array.from(atob(signature), ch => ch.charCodeAt(0))

  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sigBytes,
    data,
  )

  if (!valid) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // 4. Mark challenge as used
  await db.update(authChallenges)
    .set({ usedAt: new Date() })
    .where(eq(authChallenges.id, challenge.id))

  // 5. Generate Supabase session for shadow user
  // We use admin.generateLink to create a magic-link-style token,
  // then exchange it for a session
  const { data: sessionData, error: sessionError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: identity.email!,
    })

  if (sessionError || !sessionData) {
    console.error('Failed to generate session:', sessionError)
    return c.json({ error: 'Authentication failed' }, 500)
  }

  // Exchange the magic link token for a session
  const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
    token_hash: sessionData.properties.hashed_token,
    type: 'magiclink',
  })

  if (verifyError || !verifyData.session) {
    console.error('Failed to create session:', verifyError)
    return c.json({ error: 'Session creation failed' }, 500)
  }

  // Get server URL for storage config
  const serverUrl = new URL(c.req.url).origin

  return c.json({
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
    expires_in: verifyData.session.expires_in,
    expires_at: verifyData.session.expires_at ?? 0,
    user: {
      id: verifyData.user!.id,
      email: identity.email ?? '',
    },
    identity: {
      id: identity.id,
      did: identity.did,
      tier: identity.tier,
    },
  })
})

export default app
```

### Step 6: Create recovery endpoints

```typescript
// Add to identity-auth.ts before the export:

/**
 * POST /identity-auth/update-recovery
 *
 * Upload or update the encrypted private key backup.
 * Requires authenticated session (JWT).
 */
app.post('/update-recovery', async (c) => {
  // This endpoint needs auth — will be protected by authMiddleware
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.substring(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json<{
    encryptedPrivateKey: string
    privateKeyNonce: string
    privateKeySalt: string
  }>()

  await db.update(identities)
    .set({
      encryptedPrivateKey: body.encryptedPrivateKey,
      privateKeyNonce: body.privateKeyNonce,
      privateKeySalt: body.privateKeySalt,
      updatedAt: new Date(),
    })
    .where(eq(identities.supabaseUserId, user.id))

  return c.json({ status: 'updated' })
})

/**
 * POST /identity-auth/recover
 *
 * Request recovery of encrypted private key.
 * Server sends the encrypted key to the registered email.
 * User decrypts with vault password.
 */
app.post('/recover', async (c) => {
  const { email } = await c.req.json<{ email: string }>()

  const [identity] = await db.select().from(identities)
    .where(eq(identities.email, email))
    .limit(1)

  if (!identity || !identity.encryptedPrivateKey) {
    // Don't reveal if account exists
    return c.json({ status: 'recovery_sent' })
  }

  // Send encrypted key via email
  // The email contains: encryptedPrivateKey, nonce, salt, DID
  // User enters vault password to decrypt
  // Implementation depends on server operator's email service
  // For Supabase: use edge function or custom SMTP
  console.log(`[RECOVERY] Recovery requested for ${identity.did}`)

  // TODO: Send email with encrypted key data
  // For now, return the data directly (in production, send via email)

  return c.json({ status: 'recovery_sent' })
})
```

### Step 7: Mount new routes on server

```typescript
// haex-sync-server/index.ts — add:
import identityAuthRoutes from './src/routes/identity-auth'

// Mount BEFORE the auth middleware (these endpoints are public):
app.route('/identity-auth', identityAuthRoutes)
```

### Step 8: Generate and apply database migration

```bash
cd /home/haex/Projekte/haex-sync-server
bun run db:generate
bun run db:push
```

### Step 9: Commit

```bash
git add -A
git commit -m "feat: add identity-based challenge-response auth endpoints"
```

---

## Task 3: Remove Legacy Auth — Clean Slate

**Goal:** Remove the old email/password login system and the separate keypairs table. Since there are no production users, we do a clean break.

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/auth.ts` — remove login/refresh, keep admin endpoints
- Delete: `/home/haex/Projekte/haex-sync-server/src/routes/keypairs.ts` — no longer needed (identity replaces keypairs)
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts` — remove `userKeypairs` table
- Modify: `/home/haex/Projekte/haex-sync-server/index.ts` — remove keypairs route mount
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/spaces.ts` — use `identities` table instead of `userKeypairs` for public key lookup

### Step 1: Remove old auth routes

Keep only `POST /auth/admin/create-user` (for tests) and `GET /auth/storage-credentials`.
Remove `POST /auth/login` and `POST /auth/refresh` — these are replaced by `/identity-auth/challenge` + `/identity-auth/verify`.

### Step 2: Remove keypairs routes and table

The `userKeypairs` table is replaced by `identities` — which already has `publicKey`, plus encrypted private key backup. Remove `keypairs.ts` route file entirely.

### Step 3: Update spaces.ts

Replace `resolveCallerPublicKey()` helper to look up identity from `identities` table instead of `userKeypairs`:

```typescript
// spaces.ts — update the helper:

async function resolveCallerPublicKey(userId: string): Promise<string | null> {
  const [identity] = await db.select()
    .from(identities)
    .where(eq(identities.supabaseUserId, userId))
    .limit(1)
  return identity?.publicKey ?? null
}
```

### Step 4: Update sync.helpers.ts

The `resolveEffectiveUserId()` helper currently looks up `userKeypairs` by public key. Update to use `identities`:

```typescript
// sync.helpers.ts — update:

async function resolveEffectiveUserId(signedBy: string): Promise<string | null> {
  const [identity] = await db.select()
    .from(identities)
    .where(eq(identities.publicKey, signedBy))
    .limit(1)
  return identity?.supabaseUserId ?? null
}
```

### Step 5: Remove userKeypairs from schema

```typescript
// db/schema.ts — delete the entire userKeypairs table definition and types
```

### Step 6: Generate migration and commit

```bash
cd /home/haex/Projekte/haex-sync-server
bun run db:generate
bun run db:push
git add -A
git commit -m "feat: remove legacy email/password auth, keypairs table"
```

---

## Task 4: Unified Space Model — "Everything is a Space"

**Goal:** Remove the `type: 'personal' | 'space'` distinction. Personal sync becomes a single-member space that's automatically created on registration.

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/identity-auth.ts` — auto-create personal space on registration
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts` — update `spaces` table (add `isPersonal` flag)
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/spaces.ts` — protect personal space from deletion
- Modify: `/home/haex/Projekte/haex-vault/src/database/schemas/haex.ts` — remove `type` column from `haexSyncBackends`
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/backends.ts` — simplify backend model
- Modify: `/home/haex/Projekte/haex-vault/src/stores/vault/index.ts` — remove `ensureDefaultIdentityAsync` type checks

### Step 1: Add isPersonal flag to spaces table

```typescript
// db/schema.ts — add column to spaces:
isPersonal: boolean('is_personal').notNull().default(false),
```

### Step 2: Auto-create personal space on registration

After successful email verification in `/identity-auth/verify-email`, automatically create a personal space for the user:

```typescript
// identity-auth.ts — in verify-email handler, after marking verified:

// Auto-create personal space
const spaceId = crypto.randomUUID()
await db.insert(spaces).values({
  id: spaceId,
  ownerId: identity.supabaseUserId!,
  encryptedName: '', // Personal space — name not needed server-side
  nameNonce: '',
  isPersonal: true,
})

// Add user as admin member
await db.insert(spaceMembers).values({
  spaceId,
  publicKey: identity.publicKey,
  label: 'Personal',
  role: 'admin',
  canInvite: false, // Personal space — no invites
})
```

### Step 3: Simplify vault sync backend schema

```typescript
// haex-vault/src/database/schemas/haex.ts — update haexSyncBackends:
// Remove: type column
// Remove: email, password columns (no longer needed for auth)
// Add: isPersonal flag
// Keep: spaceId, spaceToken, identityId (all backends are space-based now)
```

The sync backend becomes:
```typescript
export const haexSyncBackends = sqliteTable('haex_sync_backends', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  serverUrl: text('server_url').notNull(),
  vaultId: text('vault_id'),
  spaceId: text('space_id'),
  spaceToken: text('space_token'),
  identityId: text('identity_id').references(() => haexIdentities.id),
  syncKey: text('sync_key'),
  vaultKeySalt: text('vault_key_salt'),
  isPersonal: integer('is_personal', { mode: 'boolean' }).default(false),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  priority: integer('priority').default(0),
  lastPushHlcTimestamp: text('last_push_hlc_timestamp'),
  lastPullServerTimestamp: text('last_pull_server_timestamp'),
  pendingVaultKeyUpdate: integer('pending_vault_key_update', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: integer('updated_at'),
}, (table) => [
  haexCrdtMetaColumns(table),
])
```

### Step 4: Update vault store auto-login

In `/home/haex/Projekte/haex-vault/src/stores/vault/index.ts`, replace the email/password login flow with challenge-response:

```typescript
// autoLoginAndStartSyncAsync — new flow:

for (const backend of enabledBackends) {
  if (!backend.identityId) continue

  const identity = await identityStore.getIdentityAsync(backend.identityId)
  if (!identity) continue

  // 1. Request challenge
  const challengeRes = await fetch(`${backend.serverUrl}/identity-auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ did: identity.did }),
  })
  const { nonce } = await challengeRes.json()

  // 2. Sign challenge
  const { importUserPrivateKeyAsync } = await import('@haex-space/vault-sdk')
  const privateKey = await importUserPrivateKeyAsync(identity.privateKey)
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(nonce),
  )
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))

  // 3. Verify and get JWT
  const verifyRes = await fetch(`${backend.serverUrl}/identity-auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ did: identity.did, nonce, signature }),
  })
  const session = await verifyRes.json()

  // 4. Set Supabase session (for RLS)
  // ... existing setSession logic with session.access_token
}
```

### Step 5: Commit

```bash
git add -A
git commit -m "feat: unify personal and shared sync into space model"
```

---

## Task 5: Quota System

**Goal:** Implement storage quota enforcement per user tier. Check on push, reject if over limit.

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/sync.ts` — add quota check before accepting push
- Create: `/home/haex/Projekte/haex-sync-server/src/services/quota.ts` — quota calculation service
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts` — seed tiers

### Step 1: Create quota service

```typescript
// haex-sync-server/src/services/quota.ts

import { db } from '../db'
import { identities, spaces, spaceMembers, syncChanges, tiers } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'

export interface QuotaInfo {
  tier: string
  maxBytes: number
  usedBytes: number
  remainingBytes: number
  isOverQuota: boolean
}

/**
 * Calculate storage usage for a user across all spaces they admin.
 * Only space admins carry the quota burden.
 */
export async function getUserQuotaAsync(supabaseUserId: string): Promise<QuotaInfo> {
  // 1. Get user's tier
  const [identity] = await db.select()
    .from(identities)
    .where(eq(identities.supabaseUserId, supabaseUserId))
    .limit(1)

  if (!identity) {
    throw new Error('Identity not found')
  }

  const [tier] = await db.select()
    .from(tiers)
    .where(eq(tiers.name, identity.tier))
    .limit(1)

  const maxBytes = tier ? parseInt(tier.maxStorageBytes) : 0

  // 2. Find all spaces where user is admin
  const adminSpaces = await db.select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(and(
      eq(spaceMembers.publicKey, identity.publicKey),
      eq(spaceMembers.role, 'admin'),
    ))

  if (adminSpaces.length === 0) {
    return { tier: identity.tier, maxBytes, usedBytes: 0, remainingBytes: maxBytes, isOverQuota: false }
  }

  // 3. Sum storage across all admin spaces
  // vaultId = spaceId for spaces
  const spaceIds = adminSpaces.map(s => s.spaceId)
  const [result] = await db.select({
    totalBytes: sql<string>`COALESCE(SUM(LENGTH(${syncChanges.encryptedValue})), 0)`,
  })
    .from(syncChanges)
    .where(sql`${syncChanges.vaultId} IN ${spaceIds}`)

  const usedBytes = parseInt(result?.totalBytes ?? '0')

  return {
    tier: identity.tier,
    maxBytes,
    usedBytes,
    remainingBytes: Math.max(0, maxBytes - usedBytes),
    isOverQuota: usedBytes > maxBytes,
  }
}
```

### Step 2: Add quota check to push endpoint

```typescript
// sync.ts — add at the beginning of POST /sync/push handler:

// Quota check for space admin
const quota = await getUserQuotaAsync(userId)
if (quota.isOverQuota) {
  return c.json({
    error: 'Storage quota exceeded',
    quota: {
      tier: quota.tier,
      maxBytes: quota.maxBytes,
      usedBytes: quota.usedBytes,
    },
  }, 413)
}
```

### Step 3: Seed default tiers

```sql
INSERT INTO tiers (name, max_storage_bytes, max_spaces, description) VALUES
  ('free', '104857600', 3, '100 MB, 3 spaces'),
  ('pro', '5368709120', 20, '5 GB, 20 spaces'),
  ('enterprise', '53687091200', 100, '50 GB, 100 spaces');
```

### Step 4: Commit

```bash
git add -A
git commit -m "feat: add storage quota system with tier enforcement"
```

---

## Task 6: Vault Client — Registration & Login UI

**Goal:** Replace the sync backend setup dialog with identity-based registration flow. User selects identity → enters server URL → server shows required claims → user approves → registration → verification → space creation.

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/components/haex/system/settings/` — update settings UI
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/backends.ts` — new registration flow
- Modify: `/home/haex/Projekte/haex-vault/src/stores/spaces.ts` — integrate with new auth

### Step 1: Create server connection flow composable

```typescript
// haex-vault/src/composables/handlers/useServerConnection.ts

/**
 * Handles the full flow of connecting to a sync server:
 * 1. Fetch server requirements
 * 2. Show consent UI for required claims
 * 3. Register identity on server
 * 4. Wait for email verification
 * 5. Login via challenge-response
 * 6. Create personal space (or receive existing)
 * 7. Create sync backend
 */
export function useServerConnection() {
  const identityStore = useIdentityStore()
  const syncBackendsStore = useSyncBackendsStore()

  const fetchRequirementsAsync = async (serverUrl: string) => {
    const res = await fetch(`${serverUrl}/identity-auth/requirements`)
    return res.json() as Promise<{
      serverName: string
      requirements: ClaimRequirement[]
      supportedDIDMethods: string[]
    }>
  }

  const registerAsync = async (
    serverUrl: string,
    identityId: string,
    approvedClaims: Record<string, string>,
    vaultPassword: string,
  ) => {
    const identity = await identityStore.getIdentityAsync(identityId)
    if (!identity) throw new Error('Identity not found')

    // Sign claims
    const presentation = await signClaimPresentationAsync(
      identity.did,
      identity.publicKey,
      approvedClaims,
      identity.privateKey,
    )

    // Encrypt private key with vault password for recovery
    const { encryptPrivateKeyAsync } = await import('@haex-space/vault-sdk')
    const encrypted = await encryptPrivateKeyAsync(identity.privateKey, vaultPassword)

    // Register
    const res = await fetch(`${serverUrl}/identity-auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presentation,
        encryptedPrivateKey: encrypted.encryptedPrivateKey,
        privateKeyNonce: encrypted.nonce,
        privateKeySalt: encrypted.salt,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Registration failed')
    }

    return res.json()
  }

  const loginAsync = async (serverUrl: string, identityId: string) => {
    // ... challenge-response flow (as in Task 4 Step 4)
  }

  return { fetchRequirementsAsync, registerAsync, loginAsync }
}
```

### Step 2: Update settings UI

This is the UI redesign. The sync backend settings page needs:
- **"Connect to Server"** button → opens dialog with:
  1. Server URL input
  2. Identity selector dropdown
  3. "Check Requirements" button → shows server's required claims
  4. Claim consent checkboxes (required ones pre-checked and disabled)
  5. "Register" button → calls registerAsync
  6. Status indicator: "Verification pending — check your email"
  7. After verification: auto-creates personal space + sync backend

**This is a significant UI task.** The exact implementation depends on the existing component patterns in haex-vault. The key insight is that this replaces the current "Add Backend" dialog that asks for email + password.

### Step 3: Commit

```bash
git add -A
git commit -m "feat: add identity-based server registration UI"
```

---

## Task 7: Update Space Management for New Roles

**Goal:** Implement the 4-tier role system (admin, owner, member, reader) and admin transfer.

**Files:**
- Modify: `/home/haex/Projekte/haex-sync-server/src/db/schema.ts` — update role enum, add admin transfer table
- Modify: `/home/haex/Projekte/haex-sync-server/src/routes/spaces.ts` — enforce new role rules
- Modify: `/home/haex/Projekte/haex-vault/src/components/haex/system/settings/spaces.vue` — update role UI

### Step 1: Update role enforcement on server

```typescript
// spaces.ts — update invite endpoint:

// Role hierarchy: admin > owner > member > reader
const ROLE_HIERARCHY = { admin: 3, owner: 2, member: 1, reader: 0 }

// Invite rules:
// - Admin can invite anyone (any role)
// - Owner can invite member or reader only
// - Member/Reader cannot invite
function canInviteWithRole(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'admin') return true
  if (callerRole === 'owner') return targetRole === 'member' || targetRole === 'reader'
  return false
}

// Kick rules:
// - Admin can kick anyone
// - Owner can kick member or reader only
// - Member/Reader cannot kick
function canKick(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'admin') return targetRole !== 'admin'
  if (callerRole === 'owner') return targetRole === 'member' || targetRole === 'reader'
  return false
}
```

### Step 2: Add admin transfer endpoint

```typescript
// spaces.ts — new endpoint:

/**
 * POST /spaces/:spaceId/transfer-admin
 *
 * Transfer admin role to another member.
 * Requires: current admin consent + new admin consent + server operator approval.
 *
 * Flow:
 * 1. Current admin initiates transfer
 * 2. Server creates pending transfer request
 * 3. New admin accepts (separate endpoint)
 * 4. Server operator approves (if billing changes)
 * 5. Transfer completes
 */
```

This is a multi-step process. For MVP, simplify to:
- Admin calls `POST /spaces/:spaceId/transfer-admin` with `{ newAdminPublicKey }`
- New admin must call `POST /spaces/:spaceId/accept-admin` to confirm
- Server auto-approves (operator approval can be added later)

### Step 3: Update push validation for reader role

```typescript
// sync.helpers.ts — update role check:

if (role === 'reader') {
  return { valid: false, error: 'Readers cannot push changes' }
}
```

### Step 4: Commit

```bash
git add -A
git commit -m "feat: implement 4-tier role system with admin transfer"
```

---

## Task 8: Vault Client — Sync Backend Cleanup

**Goal:** Remove all legacy `email`/`password` fields from sync backend handling. Every backend is now identity-based.

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/stores/vault/index.ts` — rewrite `autoLoginAndStartSyncAsync`
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/backends.ts` — remove email/password handling
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/orchestrator/push.ts` — remove `isSpaceBackend` logic
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/orchestrator/pull.ts` — remove `isSpaceBackend` logic

### Step 1: Simplify autoLoginAndStartSyncAsync

All backends now use the same auth flow:
1. Get identity from backend's `identityId`
2. Challenge-response login
3. Get JWT + storage config
4. Start sync

No more separate flows for "personal" vs "space" backends.

### Step 2: Remove isSpaceBackend checks in push/pull

Since all backends are space-based now, record signing is always required. The push/pull orchestrators should always resolve the identity private key and sign changes.

### Step 3: Remove email/password from backend store

Remove `email` and `password` fields from `addBackendAsync`, `persistTemporaryBackendAsync`, etc.

### Step 4: Commit

```bash
git add -A
git commit -m "feat: simplify sync backends to identity-only auth"
```

---

## Task 9: Recovery Flow

**Goal:** Implement the full recovery flow: user lost device → enters email + vault password → gets encrypted key → restores identity.

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/stores/identity.ts` — add recovery import
- Add recovery UI in vault settings or onboarding flow

### Step 1: Recovery flow on client

```typescript
// identity store — add:

const recoverIdentityAsync = async (
  serverUrl: string,
  email: string,
  vaultPassword: string,
) => {
  // 1. Request recovery from server
  const res = await fetch(`${serverUrl}/identity-auth/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

  // 2. User receives email with encrypted key data
  // 3. User pastes the recovery data into the app
  // 4. Decrypt with vault password
  const { decryptPrivateKeyAsync } = await import('@haex-space/vault-sdk')
  // ... decrypt and restore identity
}
```

### Step 2: Update private key backup on password change

When the vault password changes, re-encrypt the private key and upload:

```typescript
// After vault password change:
const encrypted = await encryptPrivateKeyAsync(identity.privateKey, newPassword)
await fetch(`${serverUrl}/identity-auth/update-recovery`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    encryptedPrivateKey: encrypted.encryptedPrivateKey,
    privateKeyNonce: encrypted.nonce,
    privateKeySalt: encrypted.salt,
  }),
})
```

### Step 3: Commit

```bash
git add -A
git commit -m "feat: add identity recovery via vault password"
```

---

## Task 10: Integration Testing & Cleanup

**Goal:** End-to-end test the full flow and remove any remaining legacy code.

### Step 1: Test the full flow manually

1. Create new vault
2. Create identity with email claim
3. Connect to sync server (registers identity, verifies email)
4. Personal space auto-created
5. Sync works (push/pull)
6. Create shared space
7. Invite member (second identity)
8. Member joins, syncs
9. Role enforcement works (reader can't write, owner can't kick owner)
10. Recovery flow works

### Step 2: Remove dead code

- Remove old `SyncServerLoginRequest`/`SyncServerLoginResponse` types from vault-sdk
- Remove `POST /auth/login` and `POST /auth/refresh` from server
- Remove `email`/`password` fields from vault-sdk types
- Clean up `UToggle` warning (replace with correct component)
- Remove debug `console.log` statements from `ensureDefaultIdentityAsync`

### Step 3: Update vault-sdk types and exports

```typescript
// vault-sdk/src/types.ts — new auth types:

export interface ChallengeRequest { did: string }
export interface ChallengeResponse { nonce: string; expiresAt: string }
export interface VerifyRequest { did: string; nonce: string; signature: string }
export interface VerifyResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
  user: { id: string; email: string }
  identity: { id: string; did: string; tier: string }
}
```

### Step 4: Final commit

```bash
git add -A
git commit -m "feat: complete identity-based auth migration, remove legacy code"
```

---

## Execution Order & Dependencies

```
Task 1: Identity Claims (vault-sdk + vault)
  ↓
Task 2: Server Auth Endpoints (sync-server)
  ↓
Task 3: Remove Legacy Auth (sync-server) — depends on Task 2
  ↓
Task 4: Unified Space Model (server + vault) — depends on Task 2, 3
  ↓
Task 5: Quota System (server) — depends on Task 4
  ↓
Task 6: Registration UI (vault) — depends on Task 1, 2
  ↓
Task 7: Role System Update (server + vault) — independent, can parallelize
  ↓
Task 8: Backend Cleanup (vault) — depends on Task 4, 6
  ↓
Task 9: Recovery Flow (vault + server) — depends on Task 2
  ↓
Task 10: Integration & Cleanup — last
```

**Parallelizable:**
- Task 1 + Task 2 (client-side claims + server-side auth)
- Task 5 + Task 7 (quotas + roles — independent server features)
- Task 6 + Task 9 (UI + recovery — both depend on Task 2 but not each other)
