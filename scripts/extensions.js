#!/usr/bin/env node

// Single source of truth for which apps are released as haextension bundles.
// Used by scripts/release.js and the extension CI workflows.
//
//   node scripts/extensions.js                one name per line
//   node scripts/extensions.js --check <name> exit 1 unless <name> is listed

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const appsDir = fileURLToPath(new URL('../apps', import.meta.url));

/** True if the app's package.json carries `"haextension": { "archived": true }`. */
function isArchived(appName) {
  const packageJson = JSON.parse(readFileSync(join(appsDir, appName, 'package.json'), 'utf8'));
  return packageJson.haextension?.archived === true;
}

/** Apps with a haextension manifest that are not archived, sorted by name. */
export function listExtensions() {
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(appsDir, name, 'haextension', 'manifest.json')))
    .filter((name) => !isArchived(name))
    .sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const extensions = listExtensions();
  const [flag, name] = process.argv.slice(2);
  if (flag === '--check') {
    if (!extensions.includes(name)) {
      console.error(`'${name}' is not a releasable extension. Known: ${extensions.join(', ')}`);
      process.exit(1);
    }
  } else {
    console.log(extensions.join('\n'));
  }
}
