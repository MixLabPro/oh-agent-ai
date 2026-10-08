#!/usr/bin/env node
// 飞行档案守卫（§9/§12 存档行）：解析验证（有限数值/版本/损坏降级/未知版本只读）、
// 成绩合并（更优覆盖、并列碰撞少者优先、最近访问序、20 条淘汰最旧）。
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/desktop/ui-dev/package.json", import.meta.url));
const { buildSync } = require("esbuild");
const code = buildSync({ entryPoints: [new URL("../apps/agent-city/ui/src/data/profile.ts", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node" }).outputFiles[0].text;
const mod = { exports: {} };
const windowStub = {};
windowStub.parent = windowStub; // host.ts 顶层探测 iframe：parent === window → 非嵌入
vm.runInNewContext(code, { module: mod, exports: mod.exports, console, JSON, Number, window: windowStub });
const { parseProfile, mergeRecord, EMPTY_PROFILE } = mod.exports;

// ── 解析验证 ──
{
  const good = parseProfile({ schemaVersion: 1, tutorialSeen: true, preferences: { muted: false, reducedCameraMotion: true },
    records: [{ courseId: "c1", bestTimeMs: 45_000, collisions: 2 }] });
  assert.ok(good && !good.readOnly);
  assert.equal(good.profile.tutorialSeen, true);
  assert.equal(good.profile.preferences.reducedCameraMotion, true);
  assert.equal(good.profile.records.length, 1);
  // 非法记录（NaN/缺字段/负时长）剔除；上限 20 条截断。
  const messy = parseProfile({ schemaVersion: 1, records: [
    { courseId: "ok", bestTimeMs: 1000, collisions: 0 },
    { courseId: "", bestTimeMs: 1000, collisions: 0 },
    { courseId: "nan", bestTimeMs: Number.NaN, collisions: 0 },
    { courseId: "neg", bestTimeMs: -5, collisions: 0 },
    "junk",
    ...Array.from({ length: 30 }, (_, i) => ({ courseId: `bulk:${i}`, bestTimeMs: 1000 + i, collisions: 0 })),
  ] });
  assert.ok(messy && !messy.readOnly);
  assert.ok(messy.profile.records.length <= 20, "解析侧有界（≤20 条）");
  assert.ok(messy.profile.records.some((r) => r.courseId === "ok"));
  assert.ok(messy.profile.records.every((r) => Number.isFinite(r.bestTimeMs) && r.bestTimeMs >= 0));
  assert.ok(!messy.profile.records.some((r) => r.courseId === "nan" || r.courseId === "neg" || r.courseId === ""));
  // 未知新版本：只读降级（空档案，不写回覆盖）。
  const future = parseProfile({ schemaVersion: 2, records: [{ courseId: "x", bestTimeMs: 1, collisions: 0 }] });
  assert.ok(future && future.readOnly, "未知版本只读降级");
  assert.equal(future.profile.records.length, 0);
  // 损坏输入：null（启用空档案）。
  assert.equal(parseProfile(null), null);
  assert.equal(parseProfile("string"), null);
  assert.equal(parseProfile({}), null);
}

// ── 合并规则 ──
{
  let profile = { ...EMPTY_PROFILE, records: [{ courseId: "a", bestTimeMs: 50_000, collisions: 3 }] };
  // 更差成绩不覆盖。
  profile = mergeRecord(profile, { courseId: "a", bestTimeMs: 60_000, collisions: 0 });
  assert.equal(profile.records.find((r) => r.courseId === "a").bestTimeMs, 50_000);
  // 更好成绩覆盖。
  profile = mergeRecord(profile, { courseId: "a", bestTimeMs: 48_000, collisions: 1 });
  assert.equal(profile.records.find((r) => r.courseId === "a").bestTimeMs, 48_000);
  // 并列时碰撞少者优先。
  profile = mergeRecord(profile, { courseId: "a", bestTimeMs: 48_000, collisions: 0 });
  assert.equal(profile.records.find((r) => r.courseId === "a").collisions, 0);
  // 同路线记录移到末尾（最近访问）；其余顺序保持。
  profile = mergeRecord(profile, { courseId: "b", bestTimeMs: 10_000, collisions: 0 });
  profile = mergeRecord(profile, { courseId: "a", bestTimeMs: 48_000, collisions: 0 }); // 重写 a（并列同成绩）
  assert.equal(profile.records.at(-1).courseId, "a");
  // 20 条上限：淘汰最旧（数组头部）；中途再访问的记录存活。
  for (let index = 0; index < 12; index += 1) {
    profile = mergeRecord(profile, { courseId: `fill:${index}`, bestTimeMs: 90_000 + index, collisions: 0 });
  }
  profile = mergeRecord(profile, { courseId: "a", bestTimeMs: 48_000, collisions: 0 }); // 中途再访问 a
  for (let index = 12; index < 25; index += 1) {
    profile = mergeRecord(profile, { courseId: `fill:${index}`, bestTimeMs: 90_000 + index, collisions: 0 });
  }
  assert.equal(profile.records.length, 20, "超额淘汰最旧访问记录");
  assert.ok(!profile.records.some((r) => r.courseId === "b"), "最早未再访问的 b 被淘汰");
  assert.ok(profile.records.some((r) => r.courseId === "a"), "中途再访问的 a 保留");
}

console.log("verify-city-game-profile: ok");
