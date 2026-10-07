#!/usr/bin/env node
// BuildingModel 守卫（CITY_BUILDING_MODEL_SPEC v2 §6.3，registry 驱动）：对每个已声明化的 model 检查
// 确定性（geometry() 两次深度相等）、Part.id 唯一、role / color / light 合法、lifecycle 引用的 part 存在、
// title/body 非空且与 cityCatalog 条目一致、registry 已把 kind 分发给它、编译后网格数 = 件数且材质被缓存复用。
// 场景图哈希等价由 verify-city-landmark-baseline 负责（同一批 model 在它的 golden 里）。新增 model = 进 BUILDING_MODELS，本守卫自动覆盖。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadCity, citySrc } from "./city-kit/index.mjs";
import { installCanvasShim } from "./city-kit/scene-hash.mjs";

installCanvasShim();
const { THREE, BUILDING_MODELS, LANDMARK_BUILDERS, LANDMARK_LABELS, PART_ROLES, LIGHT_KINDS, compileBuilding, createMaterialFactory } = await loadCity({
  "pkg:three": ["* as THREE"],
  "engine/models/registry.ts": ["BUILDING_MODELS", "LANDMARK_BUILDERS", "LANDMARK_LABELS"],
  "engine/models/model.ts": ["PART_ROLES", "LIGHT_KINDS"],
  "engine/render/buildingCompiler.ts": ["compileBuilding"],
  "engine/models/landmarkMaterials.ts": ["createMaterialFactory"],
});

const catalog = fs.readFileSync(path.join(citySrc, "cityCatalog.ts"), "utf8");
const catalogRow = (id) => {
  const line = catalog.split("\n").find((l) => l.includes(`{ id: "${id}", group:`));
  if (!line) return null;
  const pick = (key) => line.match(new RegExp(`${key}: "([^"]*)"`))?.[1];
  return { group: pick("group"), title: pick("title"), kind: pick("kind"), body: pick("body") };
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const TOKEN = /^district:(wall|roof|accent)$/;
const PRISM = new Set(["box", "cylinder", "cone"]);
assert(BUILDING_MODELS.length >= 2, "registry exposes the converted models");
assert.equal(new Set(BUILDING_MODELS.map((m) => m.id)).size, BUILDING_MODELS.length, "model ids unique");

// 形态参数组合：缺省 / 霓虹开关 / 不同塔高上限，覆盖 geometry 依赖 sizing 的分支。
const inputs = [{ seed: 1 }, { seed: 7, radius: 30, sizing: { cap: 70, neon: 0 } }, { seed: 7, radius: 30, sizing: { cap: 70, neon: 1 } }, { seed: 9, radius: 30, sizing: { cap: 40, neon: 1 } }];
let parts = 0;
for (const model of BUILDING_MODELS) {
  const where = (msg) => `${model.id}: ${msg}`;
  assert(model.title && model.body, where("title/body present"));
  assert.equal(model.picking.decorId, `decor:landmark:${model.id}`, where("picking.decorId follows the decor naming"));
  assert(model.sitingKey === undefined || /^(landmark|civic|site):[\w-]+$/.test(model.sitingKey), where("sitingKey shape"));
  assert.equal(typeof LANDMARK_BUILDERS[model.id], "function", where("registry dispatches this kind"));
  assert.equal(LANDMARK_LABELS[model.id], model.title, where("label derived from model.title"));
  const row = catalogRow(model.id);
  assert(row, where("catalog entry exists (cityCatalog.ts)"));
  assert.equal(row.title, model.title, where("catalog title matches"));
  assert.equal(row.body, model.body, where("catalog body matches"));
  assert.equal(row.group, model.group, where("catalog group matches"));
  assert.equal(row.kind, model.semantics, where("catalog kind matches semantics"));

  for (const input of inputs) {
    const a = model.geometry(input);
    const b = model.geometry(structuredClone(input));
    assert.deepEqual(a, b, where(`geometry() is deterministic for ${JSON.stringify(input)}`));
    assert(a.length > 0, where("plan not empty"));
    const ids = a.map((p) => p.id).filter((id) => id !== undefined);
    assert.equal(new Set(ids).size, ids.length, where("Part.id unique within a plan"));
    for (const p of a) {
      assert(PART_ROLES.includes(p.role), where(`valid role ${p.role}`));
      assert(p.color === undefined || HEX.test(p.color) || TOKEN.test(p.color), where(`valid colour ${p.color}`));
      assert(p.at.length === 3 && p.at.every(Number.isFinite), where("finite position"));
      if (p.light !== undefined) assert(LIGHT_KINDS.includes(p.light), where(`valid light kind ${p.light}`));
      assert.equal(p.role === "lit", p.light !== undefined, where("light category set exactly on lit parts"));
      if (p.emissive !== undefined) assert(p.role === "lit", where("emissive multiplier only on lit parts (legacy escape hatch)"));
      if (p.anchor === "base") assert(PRISM.has(p.kind), where("anchor base only for box/cylinder/cone"));
      if (PRISM.has(p.kind) || p.kind === "sphere") assert(p.size.every((v) => Number.isFinite(v) && v > 0), where("positive size"));
    }
    const known = new Set(ids);
    const lc = model.lifecycle;
    for (const ref of [...(lc.night?.litParts ?? []), ...(lc.spin ?? []).flatMap((s) => s.parts), ...(lc.blink?.parts ?? [])]) assert(known.has(ref), where(`lifecycle references unknown part ${ref}`));

    // 编译冒烟：每件一个网格；同 (color, emissive, side) 共用材质。
    const group = new THREE.Group(); const disposables = [];
    const byId = compileBuilding(a, { group, material: createMaterialFactory((m) => disposables.push(m)), disposables }, input);
    assert.equal(group.children.length, a.length, where("one object per part"));
    assert.equal(byId.size, ids.length, where("id → object table complete"));
    const distinct = new Set(group.children.map((c) => c.material));
    assert(distinct.size < a.length, where("materials are shared across parts"));
    parts += a.length;
  }
}
console.log(`City models: ${BUILDING_MODELS.length} declarative models (${BUILDING_MODELS.map((m) => m.id).join(", ")}) × ${inputs.length} inputs — determinism, ids, roles/colours/lights, lifecycle refs, catalog and registry dispatch passed (${parts} parts compiled).`);
