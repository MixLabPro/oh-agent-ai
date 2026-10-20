#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(repo, 'apps/desktop/src-tauri', file), 'utf8'));
// Match Tauri's RFC 7396 merge, including deletion of the Unix resource on Windows.
function merge(base, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete base[key];
    else if (typeof value === 'object' && !Array.isArray(value)) {
      base[key] = merge(base[key] ?? {}, value);
    } else base[key] = value;
  }
  return base;
}
for (const platform of ['windows', 'linux']) {
  const config = merge(read('tauri.conf.json'), read(`tauri.${platform}.conf.json`));
  const windows = platform === 'windows';
  assert.deepEqual(config.bundle.targets, windows ? ['nsis'] : ['deb', 'appimage']);
  assert.deepEqual(config.bundle.resources, windows
    ? { '../../../target/release/agent-vitals.exe': 'bin/agent-vitals.exe' }
    : { '../../../target/release/agent-vitals': 'bin/agent-vitals' });
}
console.log('Windows/Linux bundle config contracts: OK');
