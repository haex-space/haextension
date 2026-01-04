#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const repoRoot = join(rootDir, '..', '..');

// Config
const MARKETPLACE_API = process.env.MARKETPLACE_API || 'https://marketplace.haex.space';
const EXTENSION_SLUG = 'haex-files';
const CONFIG_PATH = join(homedir(), '.haex-marketplace.json');

const versionType = process.argv[2];
const shouldTag = process.argv.includes('--tag');
const shouldUpload = process.argv.includes('--upload');

if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error('Usage: node bump-version.js <patch|minor|major> [--tag] [--upload]');
  console.error('  --tag:    Create and push git tag');
  console.error('  --upload: Build and upload to marketplace');
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

// Load marketplace config (for API key)
function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  }
  return {};
}

// Get API key from env or config
function getApiKey() {
  // Priority: env var > config file
  if (process.env.MARKETPLACE_API_KEY) {
    return process.env.MARKETPLACE_API_KEY;
  }
  const config = loadConfig();
  if (config.apiKey) {
    return config.apiKey;
  }
  return null;
}

// Upload bundle to marketplace
async function uploadBundle(apiKey, version, bundlePath) {
  const bundleData = readFileSync(bundlePath);
  const manifest = JSON.parse(readFileSync(join(rootDir, 'haextension', 'manifest.json'), 'utf8'));

  const formData = new FormData();
  formData.append('bundle', new Blob([bundleData], { type: 'application/octet-stream' }), `haex-files-${version}.xt`);
  formData.append('version', version);
  formData.append('manifest', JSON.stringify(manifest));

  const response = await fetch(`${MARKETPLACE_API}/publish/extensions/${EXTENSION_SLUG}/bundle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${error}`);
  }

  return await response.json();
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

// Update manifest.json if it has a version field
const manifestPath = join(rootDir, 'haextension', 'manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version) {
    manifest.version = newVersion;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('Updated manifest.json');
  }
}

// If --tag flag is provided, commit, tag and push
if (shouldTag) {
  const tagName = `haex-files-v${newVersion}`;
  console.log(`\nCreating release tag: ${tagName}`);

  exec(`git add apps/haex-files/package.json`);
  if (existsSync(manifestPath)) {
    exec(`git add apps/haex-files/haextension/manifest.json`);
  }
  exec(`git commit -m "chore(haex-files): bump version to ${newVersion}"`);
  exec(`git tag ${tagName}`);
  exec(`git push`);
  exec(`git push origin ${tagName}`);

  console.log(`\n✅ Tag ${tagName} pushed`);
}

// If --upload flag is provided, build and upload to marketplace
if (shouldUpload) {
  console.log('\n📦 Building extension...');
  exec(`pnpm --filter haex-files build:release`);

  const bundlePath = join(rootDir, `haex-files-${newVersion}.xt`);
  if (!existsSync(bundlePath)) {
    console.error(`Bundle not found: ${bundlePath}`);
    process.exit(1);
  }

  console.log('\n🔐 Authenticating with marketplace...');
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error('\n❌ No API key configured.');
    console.error('Set MARKETPLACE_API_KEY environment variable or add apiKey to ~/.haex-marketplace.json');
    console.error('\nTo create an API key:');
    console.error('1. Go to marketplace.haex.space and log in');
    console.error('2. Navigate to your publisher settings');
    console.error('3. Create a new API key');
    process.exit(1);
  }

  console.log('\n⬆️  Uploading to marketplace...');
  try {
    const result = await uploadBundle(apiKey, newVersion, bundlePath);
    console.log(`\n✅ Successfully uploaded version ${newVersion} to marketplace`);
    console.log(`   Bundle size: ${(result.bundleSize / 1024).toFixed(1)} KB`);
    console.log(`   Bundle hash: ${result.bundleHash?.slice(0, 16)}...`);
  } catch (error) {
    console.error(`\n❌ Upload failed: ${error.message}`);
    process.exit(1);
  }
}

if (!shouldTag && !shouldUpload) {
  console.log('\nVersion bumped. Use --tag to push git tag, --upload to upload to marketplace.');
}
