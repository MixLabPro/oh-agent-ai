# Vice City 海滨强化：代码设计与分析（2026-10-05）

状态：设计稿，对应 [CITY_VICE_THEME_SPEC.md](CITY_VICE_THEME_SPEC.md)（修订版）B1–B5 的实现设计。
代码基线：`apps/agent-city/ui/src/engine/`（当前工作区，含未提交差异；实施前按 spec §1.1 记录 commit）。
本文所有行号以当前工作区为准，实施时复核。

## 0. 现状代码事实（侦察结论）

| 关注点 | 现状 | 出处 |
| --- | --- | --- |
| 地形/海岸 | `coastDistance()` 查极坐标表 O(1)；`buildable = landClearance>12 && hillProj<hillLine-12` | `cityPlan.ts:152,176` |
| 生态带 | `Biome` 五选一**随机**（tropical/temperate/boreal/savanna/eastasian）——同种子城市可能是寒带 | `cityPlan.ts:70,75,100` |
| 分区 | `zoneFor`: `coastDistance(center)<90 → waterfront`——海滨是**环岛一圈**，不是一段连续街面 | `cityPlan.ts:394-397` |
| 地表材质 | 片元里按图集 **RGB 启发式**分类（饱和度/亮度/色差 → 沥青/混凝土/草/沙/泥），湿沙只按海拔 `vCityWorld.y<1.9` | `cityParts.ts:633,655-680` |
| 行道树 | `streetTreeSpacing 17` 沿路缘、避桥/水/路口；棕榈几何带树干弯 | `cityParts.ts:1805-1854` |
| Art Deco | `facadeFor`: waterfront 且高 ≤36 且非 landmark → 立面 3（灰泥粉彩+饰带+圆角附件）；曾因 ≤22 阈值几乎零命中，已放宽到 36 | `cityParts.ts:1729-1738` |
| 昼夜 | `citySky.ts` 关键帧常量自管；theme（cityTheme.ts）与 sky 各自为政——spec 诊断的「独立常量互相覆盖」 | `citySky.ts` 全文 |
| 既有先例 | 水面 shader 已有「构建期烘焙数据纹理」模式（384² 深度图）——B2 直接复用此手法 | `cityParts.buildWater` |

## 1. B1 海滨规划（miami-coastal 配置 + 海滨带数据）

**目标**：把「环岛任意 waterfront」变成「至少一段连续、朝向良好的海滨街面」，并向下游输出沙带/步道/酒店排的候选区。

**设计**：

```ts
// cityPlan.ts 新增
export type CoastalConfig = {
  biome: Biome;               // 强制 "tropical"；miami-coastal 下不再是随机五选一
  maxHillLine: number;        // 平缓海岸约束：山线后退（如 hillLine ≥ -80 不可达）
  segments: Array<{           // 从 256 方位 coastTable 里确定性挑选
    azimuth: number;          // 段中心方位（优先南向 ±60°；hashSeed 选 1–2 段）
    arc: number;              // 弧长（如 70°–110°）
  }>;
};
export type SeasideBand = {
  // 沿段内每个采样方位（复用 coastTable 粒度）：
  azimuth: number;
  waterline: Vec2;            // 海岸点
  drySandOuter: Vec2;         // +10 单位（干沙带 0–10）
  promenade: Vec2;            // +14（步道/大道中心 10–18）
  hotelLine: Vec2;            // +26（酒店前排 20–36）
  groundY: number;            // 该方位地面高度（净空检查用）
};
// CityPlan 输出新增： seaside: SeasideBand[]（公共契约扩展，见 §6 测试）
```

- `createCityPlan(seed, config?)`：config 缺省时保持现行为（随机 biome）——**向后兼容**；`miami-coastal` 由 `activeTheme()` 侧传入（theme → plan 的单向依赖，plan 不知道 theme 存在）。
- 段内约束：段方位区间内 `buildable` 收紧为「仅 hotelLine 之外」（沙带/步道不建数据楼）；段外维持现状。已有地块避让通过把段内区从 block 生成排除实现（早于 `blocks` 循环，`cityPlan.ts:431` 之前的过滤）。
- 候选净空：每个 SeasideBand 采样点带 `groundY` 与到最近 roadEdge/parcel 的距离，供 B2/B3/S1 布点判定。

**风险**：`cityPlan` 是确定性契约核心——段选择必须纯 `hashSeed`（azimuth 量子化到 coastTable 粒度避免浮点漂移）；20 种子 geography 测试需加海滨段断言（段内无地块、段连续）。

## 2. B2 沙滩与岸线质感

**目标**：干沙/湿沙/浅水过渡由**几何数据驱动**，不再依赖图集 RGB 启发式。

**设计**：复用深度纹理先例——

```ts
// cityParts.buildTerrain 侧新增（静态城缓存段）
// RG 双通道 512²：R = coastDistance（0–60 截断归一），G = 高度（归一）
const coastTex = bakeCoastTexture(plan, 512);   // 采样 plan.coastDistance + terrain.height
uniforms.uCoast = { value: coastTex };
uniforms.uCoastWorld = { value: 60 };            // 覆盖半径
```

片元端（替换 `wS/wM` 的启发式，仅海滨带内生效）：

```glsl
float coast = texture2D(uCoast, vWorld.xz / (uCoastWorld * 2.0) + 0.5).r; // 0=水线
float drySand  = 1.0 - smoothstep(6.0, 10.0, coast);   // 干沙带
float wetSand  = smoothstep(6.0, 10.0, coast) * (1.0 - smoothstep(10.0, 16.0, coast));
// 沙纹细节随距离 LOD（复用碎波光的 fwidth 守卫手法，防摩尔纹）
float sandDetail = (1.0 - smoothstep(120.0, 300.0, dist)) * detailLOD;
```

- 沙纹：程序噪声（fbm 两档频率）叠加，不扩图集、不加文件；近景颗粒尺度 ~0.4 单位。
- 空地≠沙地：`drySand/wetSand` 权重乘 B1 的段内掩码（`seaside` 段方位区间），段外维持原 RGB 分类。
- 预算：+1 纹理（512² RG ≈ 512KB 显存）+0 draw call；烘焙成本一次性（随静态缓存）。

## 3. B3 海滨大道与棕榈步道

**设计**：

- **道路**：`cityPlan` 段内生成 `promenade` 边（kind: `"promenade"`，宽 7、无车道标线、双侧路缘）——走现有 roadEdges/roadPaint 管线（`cityRoadPaint.ts:38` 行的链合并自然处理）；两端必须接入现有路网节点（连通性由 layout 契约测试守卫）。
- **棕榈**：`buildTrees`（`cityParts.ts:1805`）扩一类「海滨列植」：步道两缘各一列，间距 9（比街道 17 密——步道树本来更密），确定性 yaw/scale 抖动已有；复用 treeMesh 通道，0 新 draw call。沙滩散植 2–3 株/段（倾斜椰树意象），入 B1 候选净空判定。
- **避让**：入口/桥接线 30 单位内不植树（视线）；树根 y 取 `groundY`（B1 已带）。

## 4. B4 Art Deco 酒店轮廓

现状 `facadeFor` 已有命中路径（waterfront ≤36）；设计增量（全部走现有附件体系 `decoTrim/decoCorner` 的扩展）：

- **新增附件类**：`awning`（水平遮阳带：薄 BOX 沿面宽、进深 1.2、间隔一层挑出）与 `parapet`（阶梯檐口：屋顶沿口 +1.2 薄板）——进 `BuildingRuntime` 附件槽（现有 deco 槽位模式，`cityParts.ts:80-81`），实例上限 = waterfront 命中楼数 × 2。
- **高 token 海滨楼**：token 高度不动（数据语义）；≥36 的海滨楼只做**裙房语汇**——底部 4 层高范围内加 awning/饰带（附件挂点在 podium 层，不碰主体高度）。
- **酒店排**（B1 hotelLine）：低会话数下允许 1–2 栋**纯装饰酒店**（不进拾取/统计，规则同高架）——复用 building 附件几何组装，标记 `decorative: true` 在 runtime 层排除拾取。
- 阳台横带：facade 3 的贴图通道已有饰带；几何阳台带只给 hotelLine 前排（≤2 栋），控实例量。

## 5. B5 昼夜配方统一

**现状**：`citySky.ts` 预设常量独立；theme 改水色/太阳但 sky 不感知。**设计**：

```ts
// citySky.ts
export function skyStateAt(hour: number, theme?: CityTheme): CitySkyPreset // theme 注入默认端点色
// DAY/DUSK/NIGHT 关键帧的 top/middle/horizon/waterShallow/waterDeep 在无 theme 时用现常量，
// 有 theme 时从 theme.sky*/water* 推导（单一来源）；KEYFRAMES 结构不变。
```

- `CityEngine.updateDaylight` 调用处传 `activeTheme()`——一处改动，所有现有调用方（天气后处理、水面 uniforms）自动一致。
- DUSK 水色偏灰黄的修正：`water.deep/shallow` 由 theme 直供后自然解决（theme 的青绿 `#1a86c4/#52dbe0` 覆盖 sky 常量的灰黄）。
- 天空浓度（原 F7）并入 theme 值调参，配 B5 一次验收。

## 6. 契约、缓存与测试

- **公共契约扩展**：`CityPlan.seaside`、`RoadEdge.kind += "promenade"`、`BuildingRuntime` 附件槽 ×2——layout/geography 契约脚本同步断言：段内无数据地块、promenade 连通、附件容量守恒。
- **静态缓存失效键**：`staticCityCache` 的命中比较（seed/scaleTier/civics/gardens 序列化）**加 `coastalConfig` 版本号**——否则换配置命中旧缓存（隐蔽 bug 源）。
- **确定性**：段选择/植树/附件全部 `hashSeed`；输入顺序无关由 layout 契约既有测试覆盖。
- **新测试**：`verify-react-city-geography.mjs` 加「海滨段存在且段内净空」断言（20 种子）；`verify-react-city-layout.mjs` 加 promenade 连通性。
- **回放/施工/导出兼容**：附件随 `applyConstruction` 的 display 缩放（现有 deco 同路径，无新逻辑）；装饰酒店不进 buildings 数组（不进生长动画与统计）。

## 7. 实施顺序与工作量

| 步 | 内容 | 依赖 | 量级 |
| --- | --- | --- | --- |
| 1 | B5 昼夜统一（最小、独立） | 无 | 半天 |
| 2 | B1 规划配置 + seaside 输出 + 契约测试 | 无 | 1–1.5 天 |
| 3 | B2 沙带纹理 + shader 权重 | B1 | 1 天 |
| 4 | B3 大道 + 棕榈列 | B1 | 1 天 |
| 5 | B4 附件 + 酒店排 | B1+B2 | 1–1.5 天 |
| 6 | 验收（spec §7 截图协议 + 盲测） | 全部 | 半天 |

总量 ≈ 一周单人；步骤 1 可先行独立交付（立刻改善黄昏水色问题），2–5 每步独立可验证、可回退。

## 8. 风险登记

1. `cityPlan` 契约扩展是全链最敏感区（geography/layout/渲染三方消费）——段掩码算法先写纯函数 + 单测再接渲染。
2. 地表 shader 改动触及现有「图集 RGB 分类」回归面——保留原路径为段外行为，海滨带内才走 uCoast（新旧路径共存，逐段切换）。
3. 静态缓存失效键遗漏 = 换主题配置看到旧海滨——列为必测项。
4. 盲测不可得时的降级路径（≥3 人 + 记录原始回答）待 spec 确认。
