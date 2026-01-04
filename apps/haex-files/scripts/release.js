#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const repoRoot = join(rootDir, '..', '..');

const versionType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error('Usage: node release.js [patch|minor|major]');
  console.error('  Default: patch');
  process.exit(1);
}

function exec(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', cwd: repoRoot, ...options });
}

console.log(`\n🚀 Starting haex-files ${versionType} release...\n`);

// Bump version and create tag
exec(`node apps/haex-files/scripts/bump-version.js ${versionType} --tag`);

console.log('\n✅ Release complete! GitHub Actions will now build and upload to marketplace.');
