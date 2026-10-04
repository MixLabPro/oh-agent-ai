#!/usr/bin/env node
// 海滨带契约守卫（CITY_VICE_THEME_TECHNICAL_DESIGN §1/T0）：确定性、朝向、
// 偏移顺序、陆海边界、保留带排他、港口避让、编码预算与降级路径。
// 消费 createCityPlan(seed, tier, config?) 的 seaside 输出与 citySeaside 纯函数。
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const city = path.join(repo, "apps/agent-city/ui/src");
const { buildSync } = createRequire(path.join(ui, "package.json"))("esbuild");
const out = buildSync({
  stdin: {
    contents: `export { createCityPlan, polygonDistance } from ${JSON.stringify(path.join(city, "engine/cityPlan.ts"))};
export { MIAMI_COASTAL, seasideStripContains, promenadePolyline, encodeDistance, decodeDistance, distanceQuantizationError } from ${JSON.stringify(path.join(city, "engine/citySeaside.ts"))};`,
    resolveDir: city,
  },
  bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent",
});
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, process, console, Math, Map, Set });
const { createCityPlan, polygonDistance, MIAMI_COASTAL, seasideStripContains, promenadePolyline, encodeDistance, decodeDistance, distanceQuantizationError } = mod.exports;

const normalizeAngle = (a) => { let r = a % (Math.PI * 2); if (r < 0) r += Math.PI * 2; return r; };
const angleDelta = (a, b) => { const d = Math.abs(normalizeAngle(a) - normalizeAngle(b)); return Math.min(d, Math.PI * 2 - d); };
const seeds = Array.from({ length: 20 }, (_, i) => (i * 2654435761 + 97) >>> 0 || 1);

// 1) 无配置：旧行为不变（seaside 为 null，生态带仍随机）。
{
  const biomes = new Set();
  for (const seed of seeds) {
    const plan = createCityPlan(seed, 2);
    assert.equal(plan.seaside, null, `seed ${seed}: 无配置时 seaside 必须为 null`);
    assert.ok(plan.blocks.length > 0, `seed ${seed}: 无配置仍生成街区`);
    biomes.add(plan.biome);
  }
  assert.ok(biomes.size >= 2, `无配置时生态带应保持随机（20 种子只见 ${biomes.size} 种）`);
}

// 2) 确定性：同 seed 同 config 两次构建，seaside 逐位相等。
{
  const a = createCityPlan(seeds[0], 2, MIAMI_COASTAL).seaside;
  const b = createCityPlan(seeds[0], 2, MIAMI_COASTAL).seaside;
  assert.deepEqual(a, b, "同 seed 同配置的 seaside 必须确定性相等");
}

// 3) 有效性、偏移顺序、陆海边界（20 种子）。
{
  let validBands = 0;
  for (const seed of seeds) {
    const plan = createCityPlan(seed, 2, MIAMI_COASTAL);
    const band = plan.seaside;
    assert.ok(band, `seed ${seed}: 应产出海滨带`);
    if (!band.degraded) validBands += 1;
    for (const sample of band.samples) {
      if (!sample.valid) continue;
      const d = (p) => Math.hypot(p.x - sample.waterline.x, p.z - sample.waterline.z);
      assert.ok(d(sample.wetOuter) < d(sample.dryOuter) && d(sample.dryOuter) < d(sample.promenade)
        && d(sample.promenade) < d(sample.hotelLine) && d(sample.hotelLine) < d(sample.outer),
        `seed ${seed}: 偏移顺序必须沿内向法线单调（湿沙靠水、干沙靠内陆）`);
      // 独立陆海校验：酒店线在海岸多边形内部（polygonDistance 内正外负）。
      assert.ok(polygonDistance(sample.hotelLine, plan.coast) > 0, `seed ${seed}: 酒店线必须在陆地上`);
      assert.ok(sample.inward.x * sample.inward.x + sample.inward.z * sample.inward.z > 0.99,
        `seed ${seed}: 内向法线必须是单位向量`);
    }
    if (!band.degraded) {
      // 保留带排他：任何数据地块不得落在带内。
      const parcels = plan.blocks.flatMap((block) => block.parcels);
      for (const parcel of parcels) {
        assert.equal(seasideStripContains(band, parcel, 0), false, `seed ${seed}: 地块 ${parcel.id} 不得落在海滨保留带内`);
      }
      // 港口避让：段中心方位避开港口 ±25°（blocked 半宽 30° 留容差）。
      const harbor = plan.publicSites.find((site) => site.kind === "harbor");
      if (harbor) {
        const harborAzimuth = normalizeAngle(Math.atan2(harbor.z - plan.core.z, harbor.x - plan.core.x));
        const mid = (band.azimuthFrom + band.azimuthTo) / 2;
        assert.ok(angleDelta(mid, harborAzimuth) > (25 * Math.PI) / 180, `seed ${seed}: 海滨段不得压港口朝向`);
      }
      // 步道折线连续（补点后相邻距 ≤ 31）。
      const polyline = promenadePolyline(band);
      assert.ok(polyline.length >= 2, `seed ${seed}: 步道折线至少两点`);
      for (let i = 1; i < polyline.length; i += 1) {
        assert.ok(Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].z - polyline[i - 1].z) <= 31,
          `seed ${seed}: 步道折线缺口必须补点（间距 ≤31）`);
      }
    }
  }
  assert.ok(validBands >= 18, `20 种子至少 18 个非降级海滨带（实际 ${validBands}）`);
}

// 4) 降级路径：不可能的净空阈值 → degraded + reason，规划不炸、街区照常。
{
  const impossible = { ...MIAMI_COASTAL, maxCoastalHeight: -1 };
  const plan = createCityPlan(seeds[1], 2, impossible);
  assert.ok(plan.seaside.degraded, "不可能阈值必须降级");
  assert.ok(typeof plan.seaside.reason === "string" && plan.seaside.reason.length > 0, "降级必须带原因");
  assert.ok(plan.blocks.length > 0, "降级不影响街区生成");
}

// 5) 编码预算：往返误差在量化界内；量化误差小于湿沙过渡宽度。
{
  const range = 60;
  for (const d of [-range, -range / 2, -1, 0, 1, range / 3, range]) {
    const v = encodeDistance(d, range);
    const back = decodeDistance(v, range);
    assert.ok(Math.abs(back - d) <= distanceQuantizationError(range) + 1e-9, `编码往返误差超界: ${d} → ${back}`);
  }
  assert.ok(distanceQuantizationError(range) < MIAMI_COASTAL.wetSandWidth, "量化误差必须小于湿沙过渡宽度");
}

console.log(`City seaside: determinism, offsets, land boundary, strip exclusion, harbor avoidance, degradation, encoding budget passed (${validCount(seeds)} seeds).`);
function validCount(s) { return s.length; }
