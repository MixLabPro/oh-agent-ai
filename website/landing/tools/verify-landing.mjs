#!/usr/bin/env node
// City-first landing contract and browser-host regressions; no network or dependencies.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const explorationCss = read('exploration.css');
assert.doesNotMatch(explorationCss, /@import|https?:\/\//);
assert.match(explorationCss, /prefers-reduced-motion/);
assert.match(html, /id="play"/);
assert.match(html, /DRIVING · FREE DRIVE AVAILABLE IN DESKTOP CITY/);
assert.match(html, /not recorded gameplay/);
assert.match(html, /Flight, driving, and jet-roadster modes are implemented in desktop City/);
assert.match(html, /A retro open-top car with jet boost/);
assert.match(html, /hold Space to climb and release to descend/);
assert.match(html, /data-exploration-panel="vtol"/);
assert.match(read('i18n.js'), /桌面版已开放自由驾驶/);
assert.match(html, /Oh-Agent-AI\/oh-agent/, 'The source FAQ must name the relocated repository');
assert.match(html, /public source repository is/);
assert.match(html, /Download the 1\.0\.0-beta\.3 desktop beta/);
assert.doesNotMatch(html, /desktop installer is not published yet|installers are still being prepared/);
assert.match(read('i18n.js'), /'faq\.8\.before': '项目代码采用 MIT 许可。公开源码仓库位于 '/, 'The Chinese FAQ must link to the public repository');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
const stylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
const stagedFiles = read('deploy.sh').match(/^cp (.+) "\$STAGE"\/$/m)?.[1].split(/\s+/) || [];
for (const asset of [...scripts, ...stylesheets]) {
  assert.ok(stagedFiles.includes(asset), `Deployment omits active asset: ${asset}`);
}
for (const name of scripts) {
  assert.ok(!/^https?:/.test(name), 'Scripts must be same-origin');
  new vm.Script(read(name), { filename: name });
  assert.doesNotMatch(read(name), /sendBeacon|XMLHttpRequest|document\.cookie|https?:\/\//);
}
for (const [, source] of html.matchAll(/<(?:img|script)[^>]+src="([^"]+)"/g)) {
  assert.ok(!/^https?:/.test(source), 'No external asset requests');
  assert.ok(existsSync(path.join(root, source.split('?')[0])), `Missing asset: ${source}`);
}
assert.doesNotMatch(css, /@import|https?:\/\//);
assert.match(css, /prefers-reduced-motion/);
assert.match(html, /Mock sessions · interactive city/);
assert.match(html, /<span>Oh Agent<small/);
assert.doesNotMatch(html, /Agent Vitals/);
assert.doesNotMatch(read('i18n.js'), /Agent Vitals/);
assert.match(html, /An estimate, not a bill/);
// Release state: 1.0.0-beta.3 is a published GitHub pre-release (verified 2026-10-22).
const i18n = read('i18n.js');
assert.match(html, /Beta · 1\.0\.0-beta\.3 · Pre-release/);
assert.match(i18n, /测试版 · 1\.0\.0-beta\.3 · 预发布/);
assert.match(html, /A private desktop app for your Claude Code and Codex history/);
assert.match(html, /data-i18n="nav.download">Download</);
assert.match(i18n, /'nav\.download': "下载"/);
assert.match(html, /Intel Mac: coming later/);
assert.match(i18n, /Intel Mac 版本随后提供/);
assert.match(html, /not code-signed yet/, 'Windows unsigned note');
assert.match(i18n, /暂未代码签名/, 'Chinese Windows unsigned note');
assert.match(html, /road-passability checks are not fully certified/);
assert.match(i18n, /道路通行检查尚未完全通过认证/);
assert.match(html, /Windows x64 · Linux x64/);
for (const stale of [/Mac app/, /Desktop release in preparation/, /No desktop installer is published/, /not currently claimed/i, /for Mac\."/, /on your Mac/, /INSIDE YOUR MAC/]) assert.doesNotMatch(html, stale, `Stale Mac-only/pending copy: ${stale}`);
for (const stale of [/Mac 应用/, /尚未发布桌面安装包/, /安装包仍在准备中/, /发布进度/, /全部在你的 MAC 内/, /留在你的 Mac/]) assert.doesNotMatch(i18n, stale, `Stale Chinese copy: ${stale}`);
assert.match(css, /city-window:not\(\[data-city-state="ready"\]\):not\(\[data-city-state="updating"\]\) \.city-actions/);
assert.ok(html.indexOf('id="city"') < html.indexOf('id="insights"'));
assert.ok(!html.includes('data-ascii'), 'No obsolete primary animation dependency');
const publicLinks = [...html.matchAll(/<a[^>]+href="(https?:[^"]+)"/g)].map((match) => match[1]);
const releaseTag = 'app-v1.0.0-beta.3';
const releasePage = `https://github.com/Oh-Agent-AI/oh-agent/releases/tag/${releaseTag}`;
const assetBase = `https://github.com/Oh-Agent-AI/oh-agent/releases/download/${releaseTag}/`;
const releaseAssets = ['oh-agent-1.0.0-beta.3-arm64.dmg', 'oh-agent-1.0.0-beta.3-windows-x86_64-setup.exe',
  'oh-agent-1.0.0-beta.3-linux-x86_64.deb', 'oh-agent-1.0.0-beta.3-linux-x86_64.AppImage', 'SHA256SUMS'];
const allowedLinks = new Set(['https://github.com/Oh-Agent-AI/oh-agent', releasePage, ...releaseAssets.map((name) => assetBase + name)]);
for (const link of publicLinks) assert.ok(allowedLinks.has(link), `Unverified public link: ${link}`);
for (const link of allowedLinks) assert.ok(publicLinks.includes(link), `Missing verified release link: ${link}`);
assert.doesNotMatch(html, /releases\/latest/, '/releases/latest skips pre-releases; link the tag');
assert.doesNotMatch(html, /x86_64\.dmg|x64\.dmg/, 'Intel Mac is not part of beta.3');
for (const [, anchor] of html.matchAll(/href="#([\w-]+)"/g)) assert.ok(html.includes(`id="${anchor}"`), `Missing anchor ${anchor}`);
assert.doesNotMatch(html, /health score|framework-agnostic|burning money|saves you/i);

// Execute localization against all actual translation-bearing elements.
function translated(lang) {
  const nodes = [];
  for (const m of html.matchAll(/<([a-z0-9-]+)\b([^>]*\bdata-i18n(?:-aria|-alt)?="[^"]+"[^>]*)>/g)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((v) => [v[1], v[2]]));
    const tail = html.slice(m.index + m[0].length);
    nodes.push({ innerHTML: tail.slice(0, tail.indexOf(`</${m[1]}>`)), getAttribute: (key) => attrs[key], setAttribute: (key, value) => { attrs[key] = value; }, attrs });
  }
  const document = { documentElement: { dataset: {} }, querySelector: () => null,
    querySelectorAll: (selector) => nodes.filter((node) => node.attrs[selector.slice(1, -1)] !== undefined) };
  const context = { document, location: { search: `?lang=${lang}`, pathname: '/', hash: '' },
    localStorage: { getItem: () => null, setItem() {} }, URLSearchParams, window: {} };
  vm.runInNewContext(read('i18n.js'), context);
  for (const key of [...html.matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)].map((m) => m[1])) {
    const value = context.window.__avLandingLang.t(key);
    assert.notEqual(value, key, `Untranslated key: ${key}`);
    if (lang === 'zh') assert.match(value, /[\u3400-\u9fff]/, `Missing Chinese translation: ${key}`);
  }
  return context.window.__avLandingLang;
}
translated('en');
translated('zh');
// The promotional selector changes only the illustrated preview, never game state.
{
  const world = { dataset: { exploration: 'vtol' } };
  const buttons = ['flight', 'drive', 'vtol'].map((mode) => ({ dataset: { explorationMode: mode }, attrs: {},
    addEventListener(type, listener) { this[type] = listener; }, setAttribute(key, value) { this.attrs[key] = value; } }));
  const panels = ['flight', 'drive', 'vtol'].map((mode) => ({ dataset: { explorationPanel: mode }, hidden: mode !== 'vtol' }));
  vm.runInNewContext(read('app.js'), { document: { querySelector: () => world,
    querySelectorAll: (selector) => selector === '[data-exploration-mode]' ? buttons : selector === '[data-exploration-panel]' ? panels : [] } });
  buttons[1].click();
  assert.equal(world.dataset.exploration, 'drive');
  assert.equal(buttons[1].attrs['aria-pressed'], 'true');
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
  buttons[0].click();
  assert.equal(world.dataset.exploration, 'flight');
  assert.equal(buttons[1].attrs['aria-pressed'], 'false');
  assert.equal(panels[0].hidden, false);
  buttons[2].click();
  assert.equal(world.dataset.exploration, 'vtol');
  assert.equal(buttons[2].attrs['aria-pressed'], 'true');
  assert.equal(panels[2].hidden, false);
  assert.equal(panels.filter((panel) => !panel.hidden).length, 1);
  assert.equal(buttons.filter((button) => button.attrs['aria-pressed'] === 'true').length, 1);
}
console.log('Content, assets, anchors, bilingual copy, privacy and cost basis: PASS');

function host({ desktop = false, reduced = false, protocol = 'http:' } = {}) {
  class Element {
    constructor() { this.dataset = {}; this.listeners = {}; this.disabled = true; this.value = '30'; this.sent = []; this.contentWindow = { postMessage: (m) => this.sent.push(m) }; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    setAttribute() {}
    append(element) { this.child = element; }
    remove() { this.removed = true; }
    focus() { this.focused = true; }
  }
  const elements = Object.fromEntries(['.city-window', '.city-stage', 'city-launch', 'city-status', 'city-window-days', 'city-reset', 'city-settings', 'city-stop'].map((id) => [id, new Element()]));
  elements['.city-window'].querySelector = () => elements['.city-stage'];
  const events = {};
  const timers = new Map();
  let timeId = 0;
  let requested = 0;
  let created;
  let resolveFetch;
  const fetchResult = new Promise((resolve) => { resolveFetch = resolve; });
  const window = { __avLandingLang: { lang: 'en', t: (key) => key }, addEventListener: (name, handler) => { events[name] = handler; } };
  const document = { hidden: false, querySelector: (key) => elements[key], getElementById: (key) => elements[key],
    createElement: () => (created = new Element()), addEventListener: (name, handler) => { events[name] = handler; } };
  const context = { document, window, location: { origin: 'http://localhost', protocol },
    matchMedia: (query) => ({ matches: query.includes('min-width') ? desktop : reduced }),
    fetch: (url, opts) => { requested++; assert.equal(url, 'city3d/index.html'); assert.equal(opts.credentials, 'omit'); return fetchResult; },
    setTimeout: (f) => { timers.set(++timeId, f); return timeId; }, clearTimeout: (id) => timers.delete(id),
    IntersectionObserver: class { constructor(fn) { fn([{ isIntersecting: true }]); } observe() {} } };
  vm.runInNewContext(read('city-host.js'), context);
  const send = (command, args, origin = 'http://localhost') => {
    const instanceId = new URL(created.src, 'http://localhost').searchParams.get('instanceId');
    events.message({ source: created.contentWindow, origin, data: { channel: 'av-plugin-rpc', type: 'request', version: 1, instanceId, requestId: 'rpc-test', command, args } });
  };
  const readProjection = (days) => {
    const instanceId = new URL(created.src, 'http://localhost').searchParams.get('instanceId');
    send('plugin_request', { request: { version: 1, instanceId, requestId: 'dto', method: 'data.read', payload: { projection: 'city', version: 2, windowDays: days } } });
    return created.sent.at(-1).result.result;
  };
  const toolbar = (enabled) => {
    const instanceId = new URL(created.src, 'http://localhost').searchParams.get('instanceId');
    send('plugin_message', { message: { version: 1, instanceId, type: 'toolbar.update', items: [{ commandId: 'city.reset', enabled }] } });
  };
  return { elements, events, timers, send, readProjection, toolbar, resolveFetch,
    requested: () => requested, frame: () => created, start: () => events['av:explore-city']() };
}
const h = host();
assert.equal(h.requested(), 0, 'Narrow view must not load 3D before user intent');
h.start(); h.start();
assert.equal(h.requested(), 1, 'Concurrent activation must coalesce');
h.resolveFetch({ ok: true });
await Promise.resolve(); await Promise.resolve();
assert.equal(h.elements['.city-window'].dataset.cityState, 'loading', 'Iframe load is not readiness');
const seven = h.readProjection(7);
assert.equal(seven.protocol, 'city:v2');
assert.equal(seven.source, 'fixture');
assert.equal(seven.harnesses.length, 4);
assert.deepEqual(JSON.parse(JSON.stringify(seven)), JSON.parse(JSON.stringify(h.readProjection(7))), 'Fixture must be deterministic');
const thirty = h.readProjection(30);
assert.equal(thirty.sessions.length, 2000, 'The default mock city must receive all 2000 sessions');
assert.equal(thirty.coverage.returned, 2000);
assert.equal(thirty.coverage.truncated, false);
assert.equal(seven.sessions.length, 469, 'The week remains a filtered subset of the same 2000-session dataset');
assert.ok(seven.sessions.length > 0 && thirty.sessions.length > seven.sessions.length);
assert.ok(seven.sessions.every((session) => Date.parse(session.last_event_at) >= Date.parse(seven.window.from)));
const count = h.frame().sent.length;
h.send('plugin_request', {}, 'https://other.example');
assert.equal(h.frame().sent.length, count, 'Foreign origins must not receive data');
const instanceId = new URL(h.frame().src, 'http://localhost').searchParams.get('instanceId');
h.send('plugin_request', { request: { version: 1, instanceId, requestId: 'denied', method: 'ui.open-session', payload: { handle: 'private' } } });
assert.equal(h.frame().sent.at(-1).result.ok, false, 'No host-session or generic IPC access');
h.elements['city-window-days'].value = '7';
h.readProjection(7); h.toolbar(true);
assert.equal(h.elements['.city-window'].dataset.cityState, 'ready');
assert.equal(h.timers.size, 0, 'Successful readiness clears the startup timeout');
h.toolbar(false);
assert.equal(h.elements['.city-window'].dataset.cityState, 'ready', 'A temporary terrain rebuild is not a fatal error');
h.readProjection(90); h.toolbar(true);
assert.equal(h.elements['city-window-days'].value, '90', 'Settings and outer range selector stay in sync');
h.elements['city-stop'].listeners.click();
assert.equal(h.elements['.city-window'].dataset.cityState, 'idle');
assert.ok(h.frame().removed, 'Closing must release the iframe and WebGL resources');
const timed = host(); timed.start(); [...timed.timers.values()][0](); timed.resolveFetch({ ok: true });
await Promise.resolve(); await Promise.resolve();
assert.equal(timed.elements['.city-window'].dataset.cityState, 'error');
assert.equal(timed.frame(), undefined, 'Late HEAD response must not create a timed-out frame');
timed.start(); await Promise.resolve(); await Promise.resolve();
assert.ok(timed.frame(), 'Retry creates a fresh instance');
const missing = host(); missing.start(); missing.resolveFetch({ ok: false });
await Promise.resolve(); await Promise.resolve();
assert.equal(missing.elements['.city-window'].dataset.cityState, 'error', 'Missing build must show fallback');
const unsupported = host(); unsupported.start(); unsupported.resolveFetch({ ok: true });
await Promise.resolve(); await Promise.resolve();
unsupported.toolbar(false);
assert.equal(unsupported.elements['.city-window'].dataset.cityState, 'error', 'Unavailable renderer readiness must show fallback');
const desktop = host({ desktop: true });
assert.equal(desktop.requested(), 1, 'Desktop hero starts the production City frontend automatically');
const reduced = host({ desktop: true, reduced: true });
assert.equal(reduced.requested(), 0, 'Reduced motion retains explicit entry');
const localFile = host({ desktop: true, protocol: 'file:' });
assert.equal(localFile.requested(), 0, 'File previews must not start an unsupported iframe request');
assert.equal(localFile.elements['.city-window'].dataset.cityState, 'local-file');
assert.equal(localFile.elements['city-launch'].disabled, true);
assert.equal(localFile.elements['city-status'].textContent, 'city.localFile');
console.log(`City host: PASS (v2 fixture ${seven.sessions.length}/${thirty.sessions.length} sessions, origin/method checks, explicit readiness, teardown, timeout, stale response, retry, missing build)`);
console.log('verify-landing: PASS (local implementation checks; links 1.0.0-beta.3 pre-release assets)');
