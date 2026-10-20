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
// 品牌改名（docs/OH_AGENT_BRAND_RENAME_PLAN.md）：三平台合并后显示名都是 Oh Agent、identifier 是新的 App ID；
// 内置 CLI 资源映射不随改名变化。平台覆盖文件不得把产品名或 identifier 覆盖回旧值。
const PRODUCT = 'Oh Agent', IDENTIFIER = 'ai.ohagent.desktop';
const base = read('tauri.conf.json');
assert.equal(base.productName, PRODUCT);
assert.equal(base.identifier, IDENTIFIER);
assert.equal(base.app.windows[0].title, `${PRODUCT} 工作台`);
for (const overlay of ['tauri.react.conf.json', 'tauri.legacy.conf.json']) {
  const config = merge(read('tauri.conf.json'), read(overlay));
  assert.equal(config.productName, PRODUCT, `${overlay}: product name`);
  assert.equal(config.identifier, IDENTIFIER, `${overlay}: identifier`);
  assert.ok(config.app.windows.every((w) => w.title.startsWith(PRODUCT)), `${overlay}: window titles use ${PRODUCT}`);
}
const probe = merge(read('tauri.conf.json'), read('tauri.isolation-probe.conf.json'));
assert.notEqual(probe.identifier, IDENTIFIER, 'the isolation probe keeps its own identity');
assert.ok(probe.identifier.startsWith(`${IDENTIFIER}.`), 'the isolation probe identity lives under the product App ID');
for (const platform of ['windows', 'linux']) {
  const config = merge(read('tauri.conf.json'), read(`tauri.${platform}.conf.json`));
  const windows = platform === 'windows';
  assert.equal(config.productName, PRODUCT, `${platform}: product name`);
  assert.equal(config.identifier, IDENTIFIER, `${platform}: identifier`);
  assert.deepEqual(config.bundle.targets, windows ? ['nsis'] : ['deb', 'appimage']);
  assert.deepEqual(config.bundle.resources, windows
    ? { '../../../target/release/agent-vitals.exe': 'bin/agent-vitals.exe' }
    : { '../../../target/release/agent-vitals': 'bin/agent-vitals' });
}
console.log('Desktop bundle config contracts (Oh Agent / ai.ohagent.desktop, Windows/Linux resources): OK');
