# Agent City 规划修复模式 SPEC：用户手改道路与建筑落位，兜底自动规划器

> 状态：**搁置待重估（2026-10-11）**——`worktree-city-opt` 正在实施规划残留闭环（见其
> `CITY_PLANNER_RESIDUAL_RESOLUTION_SPEC.md`，含未提交改动），与本模式 M2 道路编辑正面同层。
> 重估条件见 §0。原草案（2026-10-11）内容保留。
> **M1 数据层已在 `worktree-city-plan-repair`（分自 city-opt `8b571016`）落地并修订（2026-10-11）**：
> `engine/planPatch.ts` + `engine/planAudit.ts` + `data/planPatch.ts` + `scripts/verify-plan-patch.mjs`；
> 尚未接入 CityEngine / 无 UI。评审修订见 §13（与本文原草案冲突处以 §13 为准）。
> 上位文档：`CITY_PLANNER_V2_SPEC.md`（自动规划器 v2，本文与其互补不替代）、
> `CITY_ARCHITECTURE.md` §2（约束 + 修复循环）、`CITY_ROAD_NETWORK_SPEC.md`（路网语义）。
> 证据基线：`CITY_PLANNER_V2_FINDINGS.md`（2026-10-08 用户截图标注的三类生成 bug）。
> 代码基准：main @ `ffe21549`（city-opt 分支领先 13 提交且仍在演进，落地后需按新契约复核 §4–§7）。

## 0. 与 city-opt 的关系（2026-10-11 重估记录）

`worktree-city-opt` 正在实施 `CITY_PLANNER_RESIDUAL_RESOLUTION_SPEC.md`（2026-10-10 立项、
10-11 修订，状态"待实施"）：事务化求解器、路口/门路/断头/桥头闭环、约 20 个新 planner 模块，
且 `cityLayout.ts` 的生长剪枝（growWithBuildings）与 golden 基线（city-plan/scene-baseline.json）
都在改——正是本模式 M2 依赖的全部契约。其 60 岛只读基线（tier 1）显示残余广泛存在：
32 岛有未接地面路口、13 岛门路不足、6 岛主网断连、7 岛桥头不连续、14 岛断头。

**结论：暂停实施，不废弃。**

- 不冲突、可继续的唯一部分：无（M1 的体检规则一半读 `planner/constraints.ts`，该文件在重构中）。
- 重估触发：city-opt 合并 main 后跑 `scripts/city-kit/survey.mjs 60 1` 同口径对比——
  残余仍肉眼可见 → 本模式按"兜底环"重立项；残余趋近零 → 仅剩"用户主导规划"的产品理由，另行决策。
- 落地时需复核本 spec：§4 id 契约（road edge/node id、parcel id 稳定性）、
  §5 派生重算口径（city-opt 给 growWithBuildings 加了 retention/demand-path/display-junction 新语义）、
  §6 规则表（constraints.ts 导出变化）。

## 1. 为什么做

自动规划链（`createCityPlan` → `planner/solve.ts` 不动点求解 → `layoutCity` 落位）已经把违例率压到
普查上限内，但两类残余永远存在：

1. **求解器天花板**：终止条件是「零改动」或迭代上限，剩余违例如实上报但不消失
   （FINDINGS ②：体育场前断头路、环道未接回主网——`looseInlandRoadEnds` 残留类）。
2. **审美/语义判断无法自动化**：楼压路、楼悬空、堤道接口错位（FINDINGS ①③）这类复合几何问题，
   求解器只能按谓词逼近，用户看一眼就知道哪里不对。

本 spec 定义**规划修复模式（Plan Repair）**：数据视图下的一个编辑子模式，用户可以
拖动道路节点、删除路段、把会话楼移到别的空地块，修掉生成 bug。与 planner v2 的关系：
v2 继续提高自动质量上限，本模式是**人工兜底环**——两者共用同一套约束语言（constraint id），
「求解器认为合格」「体检认为合格」「编辑器放行」三者同源。

FINDINGS 三例与本模式的对应：

| FINDINGS 案例 | 修复手段 | 里程碑 |
| --- | --- | --- |
| ① 红色长条楼压沿海路、悬空插坡 | 移动建筑到别的空地块（M1） | M1 |
| ② 体育场前断头路、环道孤立 | 拖节点顺直接回 / 删多余路段（M2）；新增路段接回（M3 可选） | M2/M3 |
| ③ 堤道落地端与沿海路接口错位 | 拖陆地端节点对齐（桥体锁定，M2） | M2 |

## 2. 目标与非目标

**目标**

- 用户可修改：道路节点位置（非桥、非滨海段）、删除路段、会话楼落位（换空地块）。
- 每次编辑有确定性校验：硬阻止引入新违例，软警告提示质量下降。
- 体检（audit）：一键扫描全城，把「生成 bug 候选」列成可定位清单。
- 补丁按种子持久化，刷新/数据更新不丢失、不搬家；「恢复生成」一键回滚。
- 修复结果自动进入飞行世界：穿环路线在新城市上重新生成（改了城就是新赛道）。

**非目标**

- 不做分区/经济/需求等建造玩法（那是另一个方向，见调研记录）。
- 不允许编辑地形、海岸、河流、花园、市政配套、公共用地、地标、背景楼——景观与生成语义锁定。
- 不改 planner 求解器本身；不追求「编辑后重新自动规划」。
- 不新增道路段（M1/M2）；不做建筑旋转/缩放（地块自带朝向，换地块即换朝向）。

## 3. 总体架构

三层，全部沿用现有工程约定（纯函数核心 + 引擎窄 API + 薄 React 壳）：

```
createCityPlan(seed, tier, coastal)          ← 不动（planner v2 的地盘）
        ↓
layoutCity(model, previous, seed, ...)       ← 不动（刷新不搬家契约保持）
        ↓
applyPlanPatch(layout, patch, model)         ← 新增：纯后处理，产 effective layout
        ↓
CityEngine.currentLayout                     ← 下游全部无感：
        ↓                                       静态城渲染（activityKey 指纹触发重画）、
FlightWorld 冻结 / RaceCourse / 数据视图拾取      飞行世界、穿环路线、点击拾取
```

- **数据层** `engine/planPatch.ts`：`PlanPatchV1` 类型、`applyPlanPatch`、`validateEdit`、补丁派生重算。纯模块，无 three/DOM，可被 verify 脚本直接跑。
- **体检层** `engine/planAudit.ts`：`auditPlan(plan 级约束复用) + auditLayout(布局级新增) → PlanIssue[]`。纯模块。
- **交互层** `engine/planEditor.ts` + `features/city` 侧面板：拾取、拖拽、ghost、高亮、撤销栈。经 CityEngine 窄 API 挂场景对象，React 只渲染面板状态（复刻 game/ 的「引擎类 + 薄壳」结构）。
- **持久层** `data/planPatch.ts`：走 `@agent-vitals/app-sdk`，与 `data/seed.ts` / `data/profile.ts` 同模式，本地存储、绝不上传（数据政策 §2026-09-19 合规：编辑内容是本地用户数据）。

## 4. 数据结构

```ts
/** engine/planPatch.ts */
export const PLAN_PATCH_VERSION = 1;

/** 一个种子一份补丁；reseed 不清其他种子的补丁。 */
export type PlanPatchV1 = {
  version: 1;
  seed: number;
  updatedAt: number;
  /** 道路节点 id（`${x}:${z}`，见 cityLayout.ts:485 的 id 口径）→ 新位置。 */
  nodeMoves: Record<string, Vec2>;
  /** 删除的路段 id（RoadEdge.id）。 */
  edgeDrops: string[];
  /** 会话楼 id（session_ref）→ 新地块 id（Parcel.id）。 */
  buildingMoves: Record<string, string>;
  /** 压制的背景楼 id（context:`parcelId`），M3：修路后挡路的背景楼直接移除。 */
  suppressedContext: string[];
};

/** data/planPatch.ts —— app-sdk 存储的顶层形状：多种子共存。 */
export type PlanPatchStore = { version: 1; patches: Record<string /*seed*/, PlanPatchV1> };
```

设计要点：

- **补丁引用稳定 id**，不存坐标序号：`Parcel.id` / `RoadEdge.id` / 节点 `x:z` 在同种子同档位内
  刷新稳定（plan 缓存键 `seed:tier:coastalKey`，cityLayout.ts:150）；`session_ref` 天然稳定。
- **跨档位（岛放大）失效策略**：parcel 位置随放大重排，`buildingMoves` 的目标地块可能不存在。
  应用时逐条校验存在性，失效条目**丢弃并在 UI 标注**「N 条补丁因城市扩容失效」，不做坐标重定位（v1 从简，诚实降级）。
- 撤销栈不进补丁结构：交互层持有 `PlanPatchV1` 快照栈（补丁对象很小，上限 100 层）。

## 5. 应用管线与派生重算

接入点唯一：`CityEngine.ts:595`

```ts
const base = layoutCity(model, reuse ? this.layout : null, this.seed, MIAMI_COASTAL, this.backdrop);
const layout = applyPlanPatch(base, this.planPatchFor(this.seed), model);   // ← 新增
```

`applyPlanPatch` 按固定顺序执行，全部确定性（无随机、输入顺序无关）：

1. **nodeMoves**：改写命中的 `roadNodes` 与关联 `roadEdges[].points` 首尾；桥边（`bridge:true`）
   与滨海段（`coastRoads` 内的边）的节点**锁定**，出现在 nodeMoves 里即整条忽略并计入失效清单。
2. **edgeDrops**：从 `roadEdges` 删除；`roadNodes` 孤立节点清掉。
3. **buildingMoves**：把 `districts[].slots[id]` 换成目标 Parcel，`grounds` 按新地块
   `terrain.height` 重算；目标被占/不存在 → 丢弃进失效清单。
4. **派生重算**（顺序固定）：
   - `culDeSacEnds`：按新边集重算度（复用 `growWithBuildings` 的 liveDegree 口径，cityLayout.ts:484）；
   - `carPaths`：按新边 pair 集过滤（同 cityLayout.ts:562 口径）；
   - `landValue`：全量重算（纯距离场，便宜，cityLayout.ts:434）；
   - `activityKey`：追加 `|patch:<FNV hash of patch>` —— 静态城缓存指纹变化即触发地面/路网重画，
     复用现有缓存失效机制；
   - `suppressedContext`（M3）：从 `contextBuildings` 剔除。
5. 返回新对象，不改入参（layoutCity 的 `previous` 复用读的是未打补丁的 this.layout，
   补丁在每次重建后重新套用——**补丁幂等**是硬契约）。

## 6. 体检（PlanAudit）

两级复用 + 新增，输出统一 `PlanIssue`：

```ts
export type PlanIssue = {
  id: string;                       // 稳定 id：`<rule>:<entityId>`
  severity: "error" | "warning" | "info";
  rule: string;                     // 与 planner constraint id 同语言（见下表）
  at: Vec2;                         // 定位用
  detail: string;                   // 面板文案
  entities: string[];               // 关联对象 id（点击定位/联动高亮）
};
```

| 级别 | 规则 | 来源 |
| --- | --- | --- |
| plan 级（直接复用） | `roadThroughSite` `looseInlandRoadEnds` `acuteJunctions` `crowdedArterials` `disconnectedComponents` `bridgeheadContinuity` `siteInWater` `sitesOverlap` | `planner/constraints.ts` 的 `measure(plan)` 原样调用 |
| layout 级（新增） | `buildingOverRoad`：会话楼矩形与路段带宽相交（谓词取 `lotClearOfRoads` 的推广，cityLayout.ts:158） | `planAudit.ts` |
| | `buildingOverlap`：两楼包络相交（口径同 FlightWorld 的保守 AABB，FlightWorld.ts:70） | 同上 |
| | `buildingOnSlope`：地块坡度 > 0.55 或 `!terrain.buildable`（口径同背景楼筛，cityLayout.ts:357） | 同上 |
| | `orphanedBlock`：有楼街区到最近非桥路段 > 40 | 同上 |
| | `courseDegraded`：路线生成失败或降级到海面弧线（RaceCourse 的 corridor 验证结果） | 调 RaceCourse 干跑 |
| | `patchStale`：补丁失效条目（跨档位/锁定边命中） | applyPlanPatch 的失效清单 |

入口：面板「体检」按钮触发全城扫描（planner measure 已是全量扫描，tier1 ~200ms 量级，可接受；
不做后台常驻）。结果按 severity 排序列表，行内「定位」按钮飞相机到 `at`。

## 7. 编辑交互与校验

### 7.1 状态机（`PlanEditorController`，纯逻辑零副作用，复刻 GameModeController 风格）

```
idle → hover(entity) → drag(building|node) → drop → commit|cancel
                └→ select(edge) → delete(edge) → commit
叠加态：undoStack / redoStack / dirty（未保存标记）
```

### 7.2 操作与吸附

| 操作 | 交互 | 吸附/反馈 |
| --- | --- | --- |
| 移动建筑 | 点选会话楼（复用现有拾取）→ 按住拖动 | ghost 半透明跟随；目标空地块中心吸附（最近优先，半径 30 内）；目标地块地面 quad 绿/红即时反馈；松手提交 |
| 拖节点 | 悬停节点（修复模式挂 InstancedMesh 小球代理）→ 拖动 | 关联路段线高亮；实时预览边几何；红显硬阻止 |
| 删路段 | 点选路段（代理胶囊）→ Del | 删除前预览保留边集；确认提交 |
| 撤销/重做 | Cmd+Z / Shift+Cmd+Z | 补丁快照栈 |
| 取消拖拽 | Esc | 回 idle，不动补丁 |

不可选即不可编辑：背景楼/配套/花园/地标/公共用地/桥/滨海段在修复模式下不响应拾取
（视觉上不做区分处理，天然满足「非景观建筑才可动」）。

### 7.3 校验（`validateEdit`，拖拽实时 + 提交前各跑一次；实时版只查局部盒）

**硬阻止**（拒绝提交，红显）：

| 编辑 | 规则 |
| --- | --- |
| 建筑移动 | 目标地块不存在/被占（会话楼、配套预留、花园、地标、酒店带）；`buildingOverRoad`/`buildingOverlap`/`buildingOnSlope` 于新位置命中；`clearsHighways` 失败（高架净空，沿用 cityPlan 谓词） |
| 节点拖动 | 任一关联边命中 `buildingOverRoad`（含背景楼/配套/花园矩形）；非桥边入水（`terrain.buildable` 逐点采样）；`acuteJunctions`（<30°）；`crowdedArterials`（并行间距不足）；与桥/滨海段相连（锁定） |
| 删除路段 | 产生 `disconnectedComponents`（复用 growWithBuildings 的连通口径：仍有楼街区不得断网）；删的是骨架边（宽 ≥12 或桥） |

**软警告**（黄条提示，允许提交）：建筑移出所属小区楔形（跨 harness 边界）；建筑离城区锚点 > 200；
补丁使 `courseDegraded`。

校验消息直接引用第 6 节规则 id——体检报告、编辑器阻止理由、CI 守卫三者同一套语言。

## 8. 与飞行/档案/其他模式的集成

- **飞行**：effective layout 就是 `engine.currentLayout`，`FlightWorld` 冻结（GameSession.ts:134）与
  `RaceCourse` 生成零改动，天然适配。
- **档案**：`courseId` 由路线几何摘要派生，改城即换 id → 最佳成绩按新 courseId 分键，
  旧城成绩保留在旧 id 下（诚实语义：改了城就是新赛道，不迁移）。
- **相机互斥**：修复模式属数据视图工具，用 orbit owner（不进 GameModeController 状态机）；
  与 cinema/film 的互斥沿用 `setCameraOwner` 现有表，修复模式激活时拒绝进入 cinema（同 game 的互斥方向）。
- **回放**：建筑移动改的是落位不是时间语义，回放生长叙事不受影响（楼仍按 startedAt 升起，只是新家）。

## 9. UI

- 入口：数据视图工具栏，「驾驶飞机」旁新增「修复规划」（初期沿用开发开关门控，同飞行模式上线节奏）。
- 左侧工具栏：选择/移动建筑/拖节点/删路段（后两项 M2）、撤销/重做、体检、补丁状态徽标
  （`N 处修改 · 已保存`）、「恢复生成」（两段确认，同 reseed 的 4 秒确认模式）。
- 右侧问题面板：体检结果列表（severity 分组），行 = 规则名 + 摘要 + 定位按钮；
  点击行 → 相机飞至 + 关联实体呼吸高亮。
- 保存：commit 后 500ms 防抖写档；写失败沿用 seed 的降级文案模式（「本次修改仅临时生效」）。

## 10. 测试与验收

ui 包无单测框架（仅 `tsc --noEmit`），沿用 verify 脚本模式：

- `scripts/verify-plan-patch.mjs`（node 直跑纯模块）：
  - 确定性：同输入两次应用逐字段相等；模型行序反转结果不变（对齐现有「reversed 输入同一座城」契约）；
  - 幂等：同一补丁套两次与套一次相等；
  - 校验用例：每条硬规则一个正/反夹具（合成小型 layout）；
  - 失效策略：跨 tier、锁定边、被占目标 → 条目丢弃 + patchStale 计数正确；
  - 体检夹具：构造带已知 bug 的合成布局，断言规则命中与 severity。
- typecheck 绿；`CITY_VERIFICATION_RUNNER.md` 挂新脚本。
- 真机 UAT（沿用 CITY_GAME_UAT 文档格式）：修复 FINDINGS ① 类楼压路全流程截图；
  体检-定位-修复闭环；改城后穿环路线重生成且档案分键正确；reseed 后补丁隔离。

验收指标：修复后体检 error 清零；补丁城市穿环路线生成成功率不低于无补丁基线；
刷新十次楼不搬家（补丁语义下稳定）。

## 11. 分期

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| M1 | 补丁层 + applyPlanPatch + 建筑移动 + 撤销/重做 + 持久化 + 体检（全规则只读）+ 问题面板 | FINDINGS ① 类可修；刷新不丢 |
| M2 | 节点拖动 + 路段删除 + 路网派生重算（culDeSac/carPaths/activityKey）+ 实时校验 | FINDINGS ② 类可修 |
| M3 | 背景楼压制（suppressedContext）+ 体检自动触发时机优化 + 教学引导 + （可选）新增路段 | FINDINGS ③ 堤道对齐可修 |

## 12. 风险与开放问题

1. **planner v2 并行演进**：v2 若重构 `RepairContext`/约束清单，plan 级体检规则跟随其导出即可
   （只依赖 `CONSTRAINTS[].measure` 签名）；需在 v2 落地时同步本文第 6 节表格。
2. **滨海带连锁**：滨海段锁定避免了 seaside 重算，但若用户把楼移进 `seasideStripContains` 带，
   audit 应加 `seasideIntrusion` 警告（M2 补）。
3. **节点拖动对 road mesh 的成本**：静态城缓存按 activityKey 重画是全量重画；拖拽中只更新
   代理线预览，松手才触发一次重画（与现有 seed 切换同量级，可接受）。
4. **补丁与「刷新不搬家」的交互**：`previous` 复用先于补丁套用，两者叠加语义已定义
   （先沿旧地址、再打补丁）；极端序列（用户移楼后数据刷新且旧地址被新会话占据）下
   以补丁为准，被挤会话按常规落位——audit 不报，文档化为已知行为。
5. **移动端/触摸**：修复模式桌面优先（指针事件），触摸拖拽 M3 再评估。

## 13. M1 数据层评审修订（2026-10-11，以本节为准）

代码审查在真实生成城市与夹具上复现了 6 个缺陷 + 2 个设计缺口，修订如下（每条都有 `verify-plan-patch.mjs` 用例钉住）：

| # | 原草案/原实现 | 实测问题 | 修订 |
| --- | --- | --- | --- |
| 1 | `buildingOverlap` 用 FlightWorld 保守 AABB | 地块对角方形半宽≈4.7、同街区间距≈7.2，相邻楼必然相交：380 楼 253 条、1600 楼 1111 条 error | `buildingRect`（非塔楼地块 0.92×0.9、塔楼 footprint，朝向随地块）+ 分离轴相交；生成城市 0 条。碰撞要保守、重叠要贴身，两个包络不共用 |
| 2 | nodeMoves 不查撞车 | 拖到已有节点 → 重复节点/路段 id；拖到相邻节点 → `0:0/0:0` 零长边 | 节点映射必须单射：落在不动节点上或多条同目标 → `node-collision` 失效，被拒节点留原位，迭代到稳定（连锁拒绝） |
| 3 | 背景楼压制失效判定 `length === before` | 一条压制生效就吞掉其余不存在 id | 按原始集合逐条比对 |
| 4 | 套用只把会话楼当占用 | 校验看配套/花园/地标/背景楼、套用不看，刷新后目标冒出背景楼仍照套 → 两楼叠 | 套用与校验共用 `reservedParcelIds` |
| 5 | 存档 `{...c, 默认, ...c}` + 裸 `JSON.parse(localStorage)` | tsc TS2783 红；`edgeDrops: null` 让套用抛异常；坏存档在 catch 分支里也抛 | `coercePlanPatch` 逐字段校验（坏条目丢、缺必填整条丢）；localStorage 读写全部 try/catch |
| 6 | §5「补丁幂等是硬契约」 | 节点移动/删路改写了 id，叠套报 missing-node/missing-edge | 契约收窄：**同一底层布局 + 同一补丁 → 同一结果**；补丁只套在 layoutCity 产物上，不承诺叠套（移楼叠套仍是 no-op） |
| 7 | §4 补丁存「节点 id」未说明是哪一版 | 编辑器从 effective 布局拾取的是重挂后的 id，写进补丁就对不上底层布局 | 补丁永远存**原始 id**；`applyPlanPatch` 返回 `ids`（effective→原始），编辑器只能经 `recordNodeMove`/`recordEdgeDrop` 写补丁 |
| 8 | §3「layoutCity 不动」+ §12.4「以补丁为准」 | 纯后处理时生长剪枝不知道楼搬走了：新家空置街区的支路已被剪掉、老家街区保住了路；刷新后目标地块可能先分给新会话，补丁以 parcel-occupied 静默失效 | `layoutCity(..., pins)`：可选第 6 参（`layoutPinsFor(patch)`），移楼在**落位阶段**先于「刷新不搬家」生效；档位不符整份不认。无 pins 时逐字节不变（scene-baseline 输出与改动前字节一致）。实测钉子让生长剪枝多保留 4 条服务路段 |

其他口径统一：

- **跨档位**：`PlanPatchV1` 增加 `scaleTier`；档位不符 → 全部条目 `tier-changed`、布局原样返回（取代 §4 的「逐条校验存在性」——同 id 地块在放大后位置已变，存在性检查会放过错位）。
- **净空口径**：体检与校验共用 `clearanceRoads`（非桥路段）；原校验含桥面，会拦下体检不报的落位。
- **校验补齐**：`validateBuildingMove(layout, model, patch, id, parcel)` 增加 `building-overlap` 硬阻止（§7.3 要求，原缺）。
- **体检定位**：`PlanIssue.at: Vec2 | null`；补丁失效条目为 null（原填 NaN，定位会把相机飞到 NaN）。
- **派生重算**：carPaths 同时认 from/to 节点对与折线中间点对；`landValue` 不在后处理里重算——移楼走 pins 后由 layoutCity 原生计算。
- **路段 id 稳定性**（更正此前评审判断）：city-opt 上路段 id 由端点坐标派生（`addNetworkEdge`/split 的 `from/to`），不是自增序号——「旧补丁改到别的路」风险低；代价是求解器微调坐标即整体失效，如实报 stale。

**仍待做**：编辑器/面板 UI（拾取、拖拽、ghost、问题面板）、M2 的 `validateNodeMove`/`validateEdgeDrop`（锐角、并行间距、断网）、plan 级体检（等 city-opt `constraints.ts` 稳定）。CityEngine 接入已完成，见 §13.1。

### 13.1 引擎接入与调试入口（2026-10-11）

- `CityEngine` 分开持有 `baseLayout`（layoutCity 原始产物，下一轮 `previous` 只读它）与 `layout`（已套补丁，GameSession/FlightWorld/拾取读的就是它）；
  `setPlanPatch(patch|null)` 重建城市。补丁只对自己的种子生效；**移除某条移楼时全量重排一次**——「刷新不搬家」会把楼留在被钉住的地块，不重排回不到生成位置。
- `planRepair/session.ts`：加载/保存（400ms 防抖）、`moveBuilding`（带硬阻止）、`moveNode`/`dropEdge`（M1 无几何校验，只有套用层锁定/撞车保护）、撤销/重做、恢复生成、`candidates`、`audit`。
  档位对不上时拒绝新编辑并提示 `reset()`，不静默覆盖旧补丁。load 带序号守卫（初始种子与存档种子两次异步读乱序返回）。
- 开关：`?cityPlan` 或 localStorage `cityPlanDev=1`，开启后 `window.__cityPlan` 可用。**未开启时不读存档、不挂 window、引擎里 planPatch 恒 null**。
- 真实引擎实测（浏览器，夹具数据）：移楼生效且飞行世界读同一份 `currentLayout`；非法移动被拒（missing-parcel / parcel-occupied+building-overlap）；
  刷新后补丁自动恢复无 stale；reset 回到原地块、undo 恢复；节点拖到相邻节点 → node-collision；再拖已拖过的节点只留一条原始 id。

### 13.2 最小编辑 UI（2026-10-11，开发开关下）

入口：城市设置 →「修复规划（开发预览）」→「进入修复模式」（`?cityPlan` / `cityPlanDev=1`）。**不放工具栏**：工具栏已满 8 项（宿主校验上限）。

- **交互**：点选会话楼 → 附近最多 40 个可搬去的空地块在地面上以绿色方块高亮 → 点任一地块（不必是高亮的）搬过去；
  点非会话物体（背景楼/配套/地标/装饰）提示「只有会话楼可以移动」且不改选中；点自己所在地块不产生补丁；点天空取消选中。
  硬阻止逐条翻译成人话（`blockerText`），不泄漏原始码，选中不丢。成功后重新选中（恢复选中环）并按新位置刷新候选。
- **面板**（`planRepair/PlanRepairPanel.tsx`）：步骤提示/反馈消息、「N 处修改 · 已保存/本次修改仅临时生效」、撤销/重做、体检（定位）、
  恢复生成（两段确认，4 秒内再点一次，同 reseed 模式）。键盘：Esc 先取消选中再退出模式；⌘Z / ⇧⌘Z。
- **引擎窄接口**（`CityEngine`）：`setRepairHook`（把选取手势翻成 `{pickedId, ground}` 交给钩子，引擎自己不再选楼/飞镜头）、
  `addOverlay`/`removeOverlay`（叠加层挂场景根，不随 CityParts 重建销毁）、`focusPoint`、`groundPointAtPointer`（射线与地形迭代求交）。
- **分层**：`controller.ts` 是纯状态机（依赖全注入，`verify-plan-repair-controller.mjs` 在 node 里直接测，不依赖 WebGL）；
  `overlay.ts`（three）/`usePlanRepair.ts`（React 胶水）/`session.ts`（补丁与存档）各管一层。
- **互斥**（§8）：游戏/航拍/导出/忙碌时进入被拒、已在模式中则自动退出；换种子退出（候选与选中属于旧城）。
- **性能**：`candidates` 按距离从近到远逐个校验，凑够 limit 即停（曾先校验全城再截断）。
- **真实引擎实测**（浏览器真实鼠标点击，夹具数据）：选楼→绿色候选→点地块搬过去→选中环跟随；点地标被拒；点远离地块的路面提示「没有可落位的地块」；
  体检通过；⌘Z/⇧⌘Z；Esc 两级；刷新后补丁恢复；恢复生成两段确认且存档清除；航拍互斥；无开关时无入口/无 window 钩子/无存档读写。
- **未做**：悬停 ghost 与逐地块红绿即时反馈、节点拖动与删路 UI（M2，依赖 `validateNodeMove`/`validateEdgeDrop`）、英文文案（开发预览仅中文）、
  plan 级体检。注意：叠加层目前只标出「可搬」的地块；不可搬的地块点下去才给原因。

### 13.3 道路工具：画路与橡皮擦（2026-10-11，取代 §13.2 里「节点拖动/删路 UI 属 M2」的说法）

用户明确要「参考游戏的画路 + 橡皮擦」，而不是工程式的拖节点。工具栏三件：**移楼（V）/ 画路（R）/ 橡皮擦（E）**，入口是画布右上角始终可见的「✎ 修复规划」按钮
（曾放在设置弹窗底部，小窗口里被挤出可视区，用户找不到）。

- **补丁结构改为道路操作日志**：`roadOps: RoadOp[]`（`drop` / `move` / `add`），按顺序重放，每个操作引用**执行当时的当前 id**。
  取代 `nodeMoves`/`edgeDrops` 两张按原始 id 存的表——画路要把宿主路段从中间拆成两半，拆出来的 id 在底层布局里不存在，「翻回原始 id」无从谈起；
  id 全由坐标推出（`x:z` / `from/to`），所以重放确定。代价：道路操作**有顺序**（buildingMoves/suppressedContext 仍是集合）。
  旧开发版存档（两张表）读回时转成日志（先删后移）。`recordNodeMove/recordEdgeDrop`、`PatchedLayout.ids` 删除。
- **端点吸附**（`resolveEndpoint`，套用与校验同口径）：距路口 < 1 → 接到路口；落在非锁定路段中间（≤ 0.6）→ 把该路段拆成两半（属性继承）；否则新建路口；宿主锁定 → 拒。
  UI 悬停吸附半径更大（路口 8、路面 4），落笔时坐标已是吸附后的精确值。每个操作在试算副本上执行，成功才提交——失败不留半截拆分。
- **画路校验**（`validateRoadAdd`）：太短（<6）/太长（>250）、锁定宿主或桥头/滨海路口、孤立（两端都没接上路网）、重复/退化、入水、穿过楼/配套/花园/地标、
  与现有路交叉（要在交叉点连接，不自动拆交叉）、新引入的锐角路口；新断头只警告。
- **橡皮擦校验**（`validateEdgeDrop`）：桥/引道/滨海、骨架干道（宽≥12）、删后有楼离最近的路 > 40、删后接网的楼被拆开；新断头警告。
- **「只拦这次编辑新引入的违例」**：生成器遗留的压路/锐角/近水段不让无关编辑全被拒；比较编辑前后同一对象的违例。
- **悬停预览**：橡皮擦——将被擦的路段红色，不可擦灰色并在面板写原因；画路——先显示吸附标记，落起点后色带绿（可行）/橙（不可行 + 原因），连续接着画；Esc 逐级取消。
  预览不是渲染 bug：曾把擦完后鼠标下那条锁定大道的灰色「不可擦」预览误认成路面异常，值得在面板里一直写明原因。
- **近似声明**：楼「接路」按最近路段的较近端点判定，不是地块 frontage 的精确证明——足以拦住断网/离路过远，不保证与规划器逐点一致。
- **真实城市（380 楼，443 路段）**：擦路 255 合法 / 188 拒绝（骨架 86、桥与滨海 99、断网 3）；单次校验最慢远低于交互阈值。
  真实引擎浏览器实测：悬停红色高亮 → 点击擦除；R 键切画路 → 起点环 → 绿色预览 → 落笔生成 T 形接入；刷新后日志恢复、0 条失效、路段/路口计数对账。

**SimCity 方向（待决策）**：用户提出可参考 SimCity 的城市编辑工具，「创建道路、建筑、景观」。道路已做；建筑与景观有一条数据诚实性红线——
会话楼是**数据**（一栋楼 = 一个会话），用户凭空「造」会话楼会让城市不再代表真实数据，必须在视觉与统计上与会话楼区分（装饰楼不进统计/拾取/回放，同背景楼）。
景观（树、花园、公园、水景）风险低，适合先做。见对话中的建议分期。
