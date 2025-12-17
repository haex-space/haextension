#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const repoRoot = join(rootDir, '..', '..');

const versionType = process.argv[2];
const shouldTag = process.argv.includes('--tag');

if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error('Usage: node bump-version.js <patch|minor|major> [--tag]');
  console.error('  --tag: Create and push git tag to trigger GitHub Actions release');
  process.exit(1);
}

function bumpVersion(currentVersion, type) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function exec(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', cwd: repoRoot, ...options });
}

// Read current package.json
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

if (!currentVersion) {
  console.error('No version found in package.json');
  process.exit(1);
}

const newVersion = bumpVersion(currentVersion, versionType);
console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('Updated package.json');

// If --tag flag is provided, commit, tag and push
if (shouldTag) {
  const tagName = `haex-pass-browser-v${newVersion}`;
  console.log(`\nCreating release tag: ${tagName}`);

  exec(`git add apps/haex-pass-browser/package.json`);
  exec(`git commit -m "chore(haex-pass-browser): bump version to ${newVersion}"`);
  exec(`git tag ${tagName}`);
  exec(`git push`);
  exec(`git push origin ${tagName}`);

  console.log(`\n✅ Tag ${tagName} pushed - GitHub Actions will create the release`);
}
