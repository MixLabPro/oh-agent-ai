#!/usr/bin/env node
// 断言 codex_session.html 模板里 sv-timeline 几何在 0/1/N 桶下的形状。
//
// 为什么是 node：几何是模板内联 JS，在 Python/Rust 里再实现一遍就是第二份拷贝，
// 必然漂移（dsh-client 的 verify-*.mjs 同一理由）。这里从标记块抽取纯函数
// svTimelineSvg，喂三组 hours 直接断言 SVG 形状。
//
// 为什么必须接进自动化：verify 脚本存在但没人跑 = 不存在——dsh-client 的 verify
// 脚本第一次放走「错图不抛异常、单测全绿」的 bug，就是没人把它接进任何流水线。
// 这个脚本由 tests/test_codex_session_timeline.py 调 node 执行（本地 unittest 与
// CI python job 都跑它）。
//
// 钉的 bug（2026-08-30）：session 01a029cb 单小时桶，折线 X(i) 恒等于 PAD，
// line 退化成零长线段（M26,26）、area 退化成零宽三角形、三个 label 叠在同一点，
// 整张图不可见，用户报「会话时间线没有渲染」。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tpl = readFileSync(join(here, 'agent_vitals', 'templates', 'codex_session.html'), 'utf8');

// 抽取 >>> sv-timeline-geometry / <<< sv-timeline-geometry 之间的纯函数源码，
// 包成函数表达式求值。函数体只依赖入参（hours/W/H/PAD/esc/num），无 DOM、无闭包。
const m = tpl.match(/\/\/ >>> sv-timeline-geometry\n([\s\S]*?)\n\s*\/\/ <<< sv-timeline-geometry/);
if (!m) throw new Error('找不到 sv-timeline-geometry 标记块');
const svTimelineSvg = new Function('hours', 'W', 'H', 'PAD', 'esc', 'num', 'return (' + m[1] + ');')();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('en-US');

let failed = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  ok  ' + msg); }
  else { failed++; console.error('FAIL  ' + msg); }
};

console.log('# sv-timeline 几何（0/1/N 桶）');

// 0 桶 → 空态消息，不是残图。
const empty = svTimelineSvg([], 800, 130, 26, esc, num);
ok(empty.includes('sv-empty') && !empty.includes('<svg'), '0 桶 → 空态消息且无 <svg>');

// 1 桶 → 可见柱（修复对象：此前退化成零长线/零宽面）。
const one = svTimelineSvg([{ hour: '2026-08-22T22', tokens: 1144727 }], 800, 130, 26, esc, num);
ok(one.includes('<svg'), '1 桶 → 产出 <svg>');
ok(one.includes('class="sv-bar"'), '1 桶 → 画 <rect class="sv-bar">');
ok(!one.includes('sv-line') && !one.includes('sv-area'), '1 桶 → 不再画退化折线/面积');
const rectW = Number((one.match(/<rect class="sv-bar" x="[\d.-]+" y="[\d.-]+" width="([\d.]+)"/) || [])[1]);
ok(rectW > 0, '1 桶 → 柱宽 > 0（' + rectW + '）');
const rectH = Number((one.match(/<rect class="sv-bar" x="[\d.-]+" y="[\d.-]+" width="[\d.]+" height="([\d.]+)"/) || [])[1]);
ok(rectH > 0, '1 桶 → 柱高 > 0（' + rectH + '；值=峰值 → 满绘图高）');
ok(one.includes('>1,144,727<'), '1 桶 → 柱顶数值 label 出现');

// N 桶 → N 点折线。
const three = svTimelineSvg([
  { hour: '2026-08-22T20', tokens: 100 },
  { hour: '2026-08-22T21', tokens: 500 },
  { hour: '2026-08-22T22', tokens: 900 },
], 800, 130, 26, esc, num);
const d = (three.match(/<path class="sv-line" d="([^"]+)"/) || [])[1];
ok(!!d, '3 桶 → 有 sv-line');
ok(d && d.split('L').length === 3, '3 桶 → 折线有 3 个点（' + (d || '') + '）');

// 调用点必须经过纯函数——防止有人绕开标记块手写几何（绕过即上述断言全部空转）。
ok(tpl.includes('tl.innerHTML = svTimelineSvg('), '模板调用点走 svTimelineSvg()，不旁路');

if (failed) { console.error('\n' + failed + ' 项断言失败'); process.exit(1); }
console.log('\n通过。');
