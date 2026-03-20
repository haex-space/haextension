#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const repoRoot = new URL('..', import.meta.url).pathname;

const extensionName = process.argv[2];
const versionType = process.argv[3] || 'patch';

const KNOWN_EXTENSIONS = ['haex-pass', 'haex-files', 'haex-calendar', 'haex-code', 'haex-draw'];

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

// Read and bump package.json
const packageJsonPath = join(repoRoot, 'apps', extensionName, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

if (!currentVersion) {
  console.error(`No version found in ${packageJsonPath}`);
  process.exit(1);
}

const newVersion = bumpVersion(currentVersion, versionType);
console.log(`${extensionName}: ${currentVersion} -> ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// Update manifest.json if it exists
const manifestPath = join(repoRoot, 'apps', extensionName, 'haextension', 'manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version) {
    manifest.version = newVersion;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
}

// Commit, tag, push
const tagName = `${extensionName}-v${newVersion}`;

run('git', ['add', `apps/${extensionName}/package.json`]);
if (existsSync(manifestPath)) {
  run('git', ['add', `apps/${extensionName}/haextension/manifest.json`]);
}
run('git', ['commit', '-m', `chore(${extensionName}): bump version to ${newVersion}`]);
run('git', ['tag', tagName]);
run('git', ['push']);
run('git', ['push', 'origin', tagName]);

console.log(`\nTag ${tagName} pushed — CI will build, sign, and release.`);
