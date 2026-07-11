#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const repoRoot = new URL('..', import.meta.url).pathname;

const extensionName = process.argv[2];
const versionType = process.argv[3] || 'patch';

const KNOWN_EXTENSIONS = ['haex-pass-browser', 'haex-calendar', 'haex-code', 'haex-draw', 'haex-notes', 'haex-image', 'haex-tetris', 'haex-mail', 'haex-game-unicorn'];

if (!extensionName || !KNOWN_EXTENSIONS.includes(extensionName)) {
  console.error(`Usage: node scripts/release.js <extension> <patch|minor|major>`);
  console.error(`  Extensions: ${KNOWN_EXTENSIONS.join(', ')}`);
  process.exit(1);
}

if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error('Version type must be: patch, minor, or major');
  process.exit(1);
}

function bumpVersion(currentVersion, type) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
  }
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
}

/** Run a command capturing stdout; returns trimmed output ('' on failure). */
function capture(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** True if the tag exists locally or on origin. */
function tagExists(tag) {
  if (capture('git', ['tag', '--list', tag])) return true;
  return capture('git', ['ls-remote', '--tags', 'origin', tag]) !== '';
}

// --- Pre-flight: fail before mutating anything ---

// A clean tree keeps the release commit minimal and rollback well-defined.
// Check before any branch switch so we don't carry dirty state across.
if (capture('git', ['status', '--porcelain'])) {
  console.error('Working tree is not clean — commit or stash changes before releasing.');
  process.exit(1);
}

// Releases are cut from main so tags always track the released history.
// Auto-switch when the tree is clean; no data loss possible.
const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
  console.log(`Switching from '${branch}' to 'main'...`);
  run('git', ['switch', 'main']);
}
run('git', ['pull', '--ff-only', 'origin', 'main']);

// Releases must be pushed as haex-space (haexhub has no write access).
const ghUser = capture('gh', ['api', 'user', '--jq', '.login']);
if (ghUser !== 'haex-space') {
  console.log(`Switching gh auth from '${ghUser || '(unknown)'}' to 'haex-space'...`);
  run('gh', ['auth', 'switch', '--user', 'haex-space']);
}

// Read current version.
const packageJsonPath = join(repoRoot, 'apps', extensionName, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

if (!currentVersion) {
  console.error(`No version found in ${packageJsonPath}`);
  process.exit(1);
}

// Compute the next version, skipping any already-tagged ones. This absorbs
// versions released from elsewhere (e.g. a tag pushed off another branch)
// so `patch` always advances to the next *free* version instead of colliding.
let newVersion = bumpVersion(currentVersion, versionType);
while (tagExists(`${extensionName}-v${newVersion}`)) {
  console.warn(`! Tag ${extensionName}-v${newVersion} already exists — skipping to next patch.`);
  newVersion = bumpVersion(newVersion, 'patch');
}

const tagName = `${extensionName}-v${newVersion}`;
console.log(`${extensionName}: ${currentVersion} -> ${newVersion}`);

// --- Mutate: bump, commit, tag, push. Roll back on any failure. ---

const manifestPath = join(repoRoot, 'apps', extensionName, 'haextension', 'manifest.json');

// Update package.json.
packageJson.version = newVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// Update manifest.json if it carries a version.
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version) {
    manifest.version = newVersion;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
}

let committed = false;
let tagged = false;
try {
  run('git', ['add', `apps/${extensionName}/package.json`]);
  if (existsSync(manifestPath)) {
    run('git', ['add', `apps/${extensionName}/haextension/manifest.json`]);
  }
  run('git', ['commit', '-m', `chore(${extensionName}): bump version to ${newVersion}`]);
  committed = true;
  run('git', ['tag', tagName]);
  tagged = true;
  // Atomic so the commit and tag land together (or neither does).
  run('git', ['push', '--atomic', 'origin', 'main', tagName]);
} catch (err) {
  console.error(`\n✖ Release failed — rolling back local changes so nothing dangles.`);
  if (tagged) capture('git', ['tag', '-d', tagName]);
  if (committed) {
    capture('git', ['reset', '--hard', 'HEAD~1']);
  } else {
    capture('git', ['checkout', '--', `apps/${extensionName}/package.json`]);
    if (existsSync(manifestPath)) {
      capture('git', ['checkout', '--', `apps/${extensionName}/haextension/manifest.json`]);
    }
  }
  console.error(String(err.message || err));
  process.exit(1);
}

console.log(`\nTag ${tagName} pushed — CI will build, sign, and release.`);
