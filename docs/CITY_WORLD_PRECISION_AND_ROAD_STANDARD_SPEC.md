# 世界精度与路桥统一尺寸规范：标准表 + 宽度统一 + 验收

> 状态：设计稿（2026-10-22）。世界精度的根因修复已经合入 `dev`（590c8b30），其余部分尚未实施。
> 起因：
> - 地标岛改造时，种子 7 的平台桥栏杆被碰撞索引拒绝（`collision-index-invalid-input`）。用户指出：
>   「如果是浮点精度导致的问题，那么可能不只有这个建筑物有问题……这是个系统问题」；
> - 用户问「道路和桥有没有标准规范？比如最小宽度不小于多少，或者统一用我们定义好的标准道路」。
>
> 两件事放在一起，是因为它们是同一类缺陷：**几何的「合法」边界没有写成一处规则，靠散落的数字碰运气**。
> 精度是「多小的误差算噪声」，尺寸是「多宽的路算标准」。
>
> 本期范围：
> - 第一部分（P1–P6），世界精度：精度规则写成文，补回归验收；
> - 第二部分（§1–§6），路桥尺寸：一张标准表、宽度全部从表里取、一个验收脚本。
>
> 不在本期：桥的纵坡、斜交、缓和段、净空阈值（见 §6）。这些一旦开始拒绝就会改动路网，要单独评审。

比例尺沿用 `engine/worldScale.ts`：1 世界单位 = 2 m。下文的「宽度」都是世界单位，括号里是真实米数。

---

# 第一部分：世界精度

## P1. 事故与根因

- **现象**：种子 7 上一座落在歌剧院平台上的桥，有 4 个栏杆 box（约 0.3 × 0.65 × 0.2，位于 x ≈ −363、z ≈ −511）
  被 `buildCollisionIndex` 判为非法，整座城的碰撞索引构建失败。
- **根因**：数组形式的 `buildCollisionIndex(inputs[])`（`citySolids`、`RoadPassabilityAudit`、各验证脚本走这条路）
  把 box 先展开成 8 个世界坐标角点，再在 `shape()` 里重新证明每个面共面。容差是 `128·ε·max(1, 实体自身尺寸)`，
  对小实体约 2.8e-14；而 |x| ≈ 500 处一个坐标的舍入误差就有约 1e-13（`ulp(512)` ≈ 1.1e-13）。
  **容差只按实体大小算、不按它离原点多远算**，所以远离原点的小实体能不能通过，全看舍入的运气。
- **游戏内路径从未受影响**：`compileCitySolidInputs` → `buildVersionedCollisionIndex` 早就传入原始 box
  （中心 + 半轴），box 按仿射构造、不做角点共面复证。代码里还写着「subtracting large world corners loses
  precision for thin rotated boxes」——这个问题之前在一条路径上被发现过，但没有推广到另一条。

## P2. 规模实测（证明这是系统问题）

用 0/90/500 会话 × 5 种子共 15 个场景，统计每个 box 走旧检查时的最大面偏差 / 旧容差：

| 项目 | 数量 |
|---|---|
| box 实体总数 | 68,294 |
| 已超出容差（会被拒绝） | 8（全部是种子 7 平台桥的栏杆） |
| 在容差 2 倍以内（随时可能被几何改动推过线） | 12，分布在 7 个场景 |

12 个临界实体不属于任何一类特定建筑，只取决于位置和朝向。这正是用户说的「不只这个建筑物」。

## P3. 已做的修复（590c8b30，已在 `dev`）

1. **box 一律按半轴构造**：数组形式的 `buildCollisionIndex` 也把原始输入作为 `sourceSolids` 传下去，
   与 `buildVersionedCollisionIndex` 一致。box 不再进入角点共面检查，**这个问题对 box 在任何坐标上都不再存在**。
2. **角点实体的容差计入绝对坐标**：只有角点、没有半轴的实体（棱柱、结构描述符）仍走 `shape()`。
   它的共面容差改为 `128·ε·max(1, 实体尺寸, 最大 |坐标|)`，与同文件 `separation()` 的舍入估计同一口径。
   这只是把容差放到真实舍入的量级（|x| = 500 时约 1.4e-11），真正扭曲的几何（偏差 ≥ 1e-6 级）仍然拒绝。
3. **结果**：`verify-city-collision` 在 15 个场景中拒绝 0 个；9 个碰撞验证全部通过。

## P4. 其余代码的精度审计

| 类别 | 位置 | 结论 |
|---|---|---|
| 舍入容差，已按绝对坐标缩放 | `CollisionIndex.separation()`；`DrivingCollision.ts` 的 SAT 间隙、扫掠松弛、`precision` 拒绝门 | 与修复同口径，没有问题 |
| 舍入容差，在局部坐标下计算 | `DrivingCollision.ts:149`（顶点先减去起点再比较） | 局部坐标的舍入远小于 `skin`，判定由 `skin` 主导，没有问题 |
| 相对量，与坐标无关 | 体积 vs 半轴体积、单位法向长度 | 没有问题 |
| 退化判定的固定阈值（1e-9 … 1e-12，约 45 处） | `structureCompiler`、`terrainClip`、`SurfaceIndex`、`groundRoadCompiler`、`compileSurface`、道路审计 | 比较的都是邻近点之差（长度是否为零、是否平行、面积符号）。地图范围 ±1000 内舍入约 1e-13，比阈值小 4 个数量级以上，暂无风险 |

## P5. 精度规则（以后写新代码照此执行）

1. **用于判定「是否相等 / 共面 / 相交」的舍入容差，必须同时按两个量缩放**：参与运算的几何尺寸，
   以及坐标的绝对量级（`max |坐标|`）。只按其中一个量缩放就是这次的缺陷。
2. **有构造信息就不要从世界坐标反推**：已知是仿射 box（中心 + 半轴）、矩形、圆，就按构造信息判定，
   不展开成世界坐标角点再证明一遍。
3. **固定的小阈值只能用于局部差量的退化判定**（长度为零、平行），不能当作舍入容差；
   比较对象必须是两点之差，不能是绝对坐标本身。
4. **地图范围是前提**：现有阈值按 ±1000 单位（±2 km）评估。若地图扩到 ±10⁴ 以上，
   第 3 条里的固定阈值要重新评估，或改为相对原点的分块坐标。

## P6. 精度验收

在 `verify-city-driving-collision.mjs`（碰撞索引的单元验证）里补一组远离原点的用例。两条构建路径
（`buildCollisionIndex` 数组形、`buildVersionedCollisionIndex`）各跑一遍：

1. 一个 0.3 × 0.65 × 0.2、绕三个轴都有旋转的小 box，放在 x、z = ±500、±5000：必须被接受，拒绝数为 0；
2. 同位置的一个真正扭曲的 8 角点实体（一个角点偏离共面 1e-6）：必须被拒绝；
3. 同位置一个小棱柱（角点实体，走 `shape()`）：必须被接受；
4. 车辆在 ±5000 处对该 box 的扫掠：结果是 `contact` 或 `clear`，不得是 `invalid-input`；
   超出 `precision` 门的坐标必须明确返回 `precision`，不得静默通过。

另外保留 P2 的统计作为诊断脚本（`scripts/diagnose-city-collision-precision.mjs`，不进 CI）：
它输出每个场景的「超出容差 / 2 倍以内」数量，改容差或几何时用来对照。

---

# 第二部分：路桥统一尺寸

## 1. 现状（2026-10-22 实测）

### 1.1 生成结果其实已经只有三档

用 15 座规划城（种子 1/7/42/2026/65537 × tier 1–3）统计 `createCityPlan` 的路段宽度，再用 10 座完整城
（0/500 会话 × 5 种子）统计 `layoutCity` 的最终路网宽度：

| 路段 | 规划层（15 城） | 完整布局（10 城） |
|---|---|---|
| 地面 local，宽 5 | 6227 | 1810 |
| 地面 arterial，宽 8 | 3657 | 1139 |
| 地面 arterial，宽 12 | 2136 | 2298 |
| 桥 local，宽 5 | 27 | 13 |
| 桥 arterial，宽 12 | — | 67 |

结论：**事实上的标准是 5 / 8 / 12 三档**（10 / 16 / 24 m）。没有出现过第四种宽度。桥面宽度与它所连的道路同档，
宽 8 的路上从未出现过桥。

### 1.2 但这套标准没有写成一处，也没有东西守着

- **三处各写各的定义**，互相不引用：
  - `engine/worldScale.ts` 文件头注释：「支路/次干道/主干道 5 / 8 / 12」，只是注释，不是常量；
  - `engine/planner/connect.ts:144` `roadWidthOf`：`primary ? 12 : roadClass !== "local" ? 8 : 5`；
  - `planRepair/controller.ts:31` `ROAD_SPEC`：`local 5 / secondary 8 / main 12 / waterfront 12`。
    这是修复工具的路型，名字与规划层（local / collector / arterial）对不上。
- **76 处宽度字面量**散在 `engine/` 和 `planner/` 里，例如：
  - 用宽度反推等级：`width >= 8 ? "arterial" : "local"`（planPatch × 3、planRoadRules × 2、snapJunctions）；
  - 用宽度判断主干道：`width >= 12`（landing、deadEnds、coastalRingRoad、junctionRings、networkRepairs、report 等）；
  - 写死宽度：`roadAdmission.ts` 的 `width: 8`，`skeleton.ts` 的 `width !== 12`，`landing.ts:455` 的 `primary ? 12 : arterial ? 8 : 5`。
- **类型只有两级**：`RoadEdge.kind` 是 `"arterial" | "local"`，但规划层的 `RoadClass` 有三级
  （`"arterial" | "collector" | "local"`）。次干道（宽 8）在路网里记成 `kind: "arterial"`，只能靠宽度区分。
- **没有校验**：`planPatch` 的 `add` / `restyle` 只要求 `width > 0`。导入的方案或手写补丁可以铺一条宽 4.2 的路，
  下游所有 `>= 8` / `>= 12` 的判断都会默默把它当支路处理。
- **桥没有自己的规范**：桥面宽度就是那条路的宽度。没有最小桥面宽、最大纵坡、桥头缓和段长、最大斜交角。
  陡桥头、斜接桥头都要等试驾（`planRepair/testDrive.ts`）才发现。
- **地形坡度不是路面纵坡**：`maxSlope: 0.9`（普通路）和 `VALIDATION_CONFIG.roadApproachMaxSlope: 6`（引道）
  限制的是**路线经过的地形** `terrain.slope`，不是路面本身的纵坡。6 是按历史实测包络 4.98 × 1.2 标定的，非常松。

### 1.3 路网之外的宽度

| 名称 | 宽度 | 位置 | 本期处理 |
|---|---|---|---|
| 区界高架桥面 | 10.5（21 m） | `surface/structureProfiles.ts` `EXPRESSWAY_DECK_WIDTH`；`planGeometry.ts` `VIADUCT_DECK_WIDTH` | 收进标准表，作为「结构」等级 |
| 修复工具画的高架 | 10.5 + 1 | `planRoadRules.ts:618` | 引用表值，+1 的含义写进表注释 |
| 离岛庄园环路 / 支路 | `m(8)` / `m(6)` = 4 / 3 | `cityIsletEstate.ts`，`REAL.estateLoopRoad` / `estateSpurRoad` | 只是渲染，不进路网；作为**登记过的例外**留在 `REAL` |
| 机场堤道（2026-10-22 新增） | `max(5, 起点最宽地面路)` | `engine/airportPlan.ts` | 改成「取起点道路的等级」，宽度从表里取 |

---

## 2. 标准表

新增纯常量模块 `engine/roadStandard.ts`：
- 属于 L1 层：不依赖 three，DetMath 不涉及；规划层、渲染层、修复工具都能引用；
- 作为**唯一来源**，`worldScale.ts` 的注释改成指向它。

### 2.1 地面道路等级

| 等级 id | 宽度 | 实际 | `kind` | 修复工具路型 | 中文名 | 依据 |
|---|---|---|---|---|---|---|
| `local` | 5 | 10 m | `local` | `local` | 支路 | 实测 1.1 |
| `collector` | 8 | 16 m | `arterial` | `secondary` | 次干道 | 实测 1.1 |
| `arterial` | 12 | 24 m | `arterial` | `main` / `waterfront` | 主干道 | 实测 1.1 |

- **滨海大道**不是一个等级，是主干道加 `purpose: "waterfront"`。保持现状。
- **`kind` 保持两级**。三级等级由宽度唯一推出（见 §3.1）。不改 `RoadEdge` 的类型，所以快照和基线不会动。
  如果以后要把 `kind` 改成三级，另立项，并重冻相关基线。

### 2.2 结构等级

| 等级 id | 桥面宽 | 实际 | 依据 |
|---|---|---|---|
| `expressway` | 10.5 | 21 m | `EXPRESSWAY_DECK_WIDTH` 现值；顶面 9.1 = `EXPRESSWAY_DECK_Y` 8.2 + 厚 0.9 |
| `ramp` | 跟随所接地面路的等级 | — | `highwayRamps.ts` 现行为 |

### 2.3 桥（本期只定宽度）

| 规则 | 值 | 说明 |
|---|---|---|
| 桥面宽度 | = 所在路段的等级宽度 | 现状就是这样，本期写成规则并验收 |
| 桥面最小宽度 | 5（支路） | 由「必须是标准档」自然推出，不另设数字 |
| 桥与引道等宽 | 必须 | 桥两端的地面路与桥面同档。不等宽本期只**报告**，不拒绝 |

### 2.4 每个等级登记的字段

```ts
type RoadClassSpec = Readonly<{
  id: "local" | "collector" | "arterial";
  width: number;            // 世界单位；唯一允许出现宽度字面量的地方
  kind: "local" | "arterial";
  repairType: "local" | "secondary" | "main";
  label: { zh: string; en: string };
  sidewalk: number;         // = SIDEWALK_BAND 1.8，三档相同，集中到这里
  // —— 第二期才填，本期为 null；填之前必须先有测量和验收集证据（同 VALIDATION_CONFIG 的规矩）——
  maxGrade: number | null;          // 路面纵坡上限
  bridgeTransition: number | null;  // 桥头缓和段最短长度
  maxBridgeSkewDeg: number | null;  // 桥轴与所接道路的最大斜交角
}>;
```

---

## 3. 宽度统一

### 3.1 API（只有这几个出口）

```ts
export const ROAD_CLASSES: readonly RoadClassSpec[];
export function roadClassSpec(id: RoadClassId): RoadClassSpec;
/** 严格反查：只认三档标准宽度，其余返回 null（不再用 >= 8 / >= 12 区间猜）。 */
export function roadClassOfWidth(width: number): RoadClassId | null;
export function isStandardRoadWidth(width: number): boolean;
/** 等级比较，替代散落的 width >= 8 / width >= 12。 */
export function atLeast(edge: { width: number }, id: RoadClassId): boolean;
export const EXPRESSWAY_DECK_WIDTH: number;
```

`roadClassOfWidth` 用严格相等。比较带 1e-9 容差，用来吸收 JSON 往返误差。

### 3.2 迁移清单

| 现状写法 | 改为 | 涉及（举例） |
|---|---|---|
| `width >= 8 ? "arterial" : "local"` | `roadClassSpec(roadClassOfWidth(w)).kind` | planPatch.ts:458/494/559，planRoadRules.ts:470/535 |
| `width >= 12` | `atLeast(e, "arterial")` | landing、deadEnds、coastalRingRoad、junctionRings、networkRepairs、report、cityLayout:697/802 等 |
| `width >= 8` | `atLeast(e, "collector")` | siteFrontage、highwayRamps、coastalRingRoad:81、planRoadRules:600 |
| `width !== 12` | `roadClassOfWidth(w) !== "arterial"` | skeleton.ts:34，networkRepairs.ts:358 |
| `primary ? 12 : arterial ? 8 : 5` | `roadClassSpec(...).width` | connect.ts:144 `roadWidthOf`，landing.ts:455，repairs.ts:241 |
| `width: 8` | `roadClassSpec("collector").width` | roadAdmission.ts:15 |
| `{ width: 12 }` 兜底主干道 | `roadClassSpec("arterial").width` | access.ts:323/410 |
| `ROAD_SPEC` 字面量 | 从标准表派生 | planRepair/controller.ts:31 |
| `EXPRESSWAY_DECK_WIDTH` / `VIADUCT_DECK_WIDTH` 两份 | 都 re-export 表里的一个值 | structureProfiles.ts、planGeometry.ts |
| 机场堤道 `max(5, …)` | 取起点道路的等级 | airportPlan.ts |

`models/`（地标场地的通道宽、球场等）不是路网宽度，不在迁移范围。

### 3.3 入口校验

- `planPatch` 的 `add` / `restyle` 只接受标准宽度。其余返回新失败码 `non-standard-width`，并给面板文案（中英）。
  不做静默吸附：吸附会改掉用户写下的值，而规范要的是明确拒绝。
- 读取旧存档时**不改写**已有路段。按 §1.1 的实测，已有路段全是标准档。万一出现非标路段，由验收脚本报出来，不在读取时修正。

### 3.4 本期不应改变生成结果

规划和布局中实际出现的宽度已经全是三档（§1.1），`>= 8` / `>= 12` 在三档上与严格反查等价。
因此**宽度统一必须对现有基线逐字节无变化**：

- `golden/`；
- `fixtures/city-driving/structure-render-baseline.json`；
- 地标、场景、跨引擎基线。

任何基线变化都说明某处原本在用非标宽度或区间语义，要先查清楚，不能直接重冻。

---

## 4. 验收

新增 `scripts/verify-city-road-standard.mjs`，登记进 `verification-manifest.json` 的 planning 段，同步
`verify-city-verification.mjs` 的计数。检查四项：

1. **路网只有标准宽度**：
   - 范围：15 座规划城，3 座海滨城（1703294958/2、1703310796/2、1703334553/5），以及 0/500 会话 × 5 种子的完整布局；
   - 每条路段（包括展示层生长出来的路、机场堤道、桥）满足 `isStandardRoadWidth(width)`；
   - 每条路段的 `kind` 等于 `roadClassSpec(roadClassOfWidth(width)).kind`。
2. **桥面宽 = 所在等级宽**；桥两端的地面路与桥同档的比例要报出来。本期**只报告**等宽比例和不等宽的桥，不失败。
3. **源码里没有游离的宽度字面量**：
   - 静态扫描 `engine/planner/`、`engine/plan*.ts`、`engine/cityLayout.ts`、`engine/airportPlan.ts`、`planRepair/`；
   - 不得再出现 `width >= 8`、`width >= 12`、`width !== 12`、`width: 5|8|12`、`? 12 : … 8 : 5` 这类写法；
   - 只有 `roadStandard.ts` 自己能写这些数；
   - 做法与 Rust 侧 `dependency_budget.rs` 的边界守卫相同：用白名单，不靠记性。
4. **入口拒绝非标宽度**：补丁 `add` 宽 4.2 和 `restyle` 宽 10 都必须得到 `non-standard-width`；宽 5 / 8 / 12 照常通过。

另外，以下现有验证必须保持全绿、基线不变：

- typecheck、导入边界；
- `verify-city-road-report`、`verify-city-structure-surface --cities`、`verify-city-landmark-platforms`；
- `verify-city-plan-patch`、`verify-city-repair-drivability`；
- `verify-city-suite full`。

---

## 5. 实施步骤

0. 世界精度：补 P6 的回归用例和诊断脚本（不改生成结果，最先做）。
1. 写 `roadStandard.ts` 和它的单测（反查、等级比较、表的冻结）。
2. 按 §3.2 逐模块替换。每替换一组就跑 typecheck 和受影响的验证，确认基线无变化。
3. 改 `planPatch` 入口校验，加失败码和文案（`repairCopy.ts` 中英各一条）。
4. 写验收脚本，登记进清单，跑全量。
5. 文档：`worldScale.ts` 的注释指向标准表；`CITY_MODULE.md` 的道路一节补一句「宽度只从 roadStandard 取」。

风险：
- 某处 `>= 8` 的真实意图其实是「不小于次干道，包括将来更宽的路」。严格反查会改变这种语义。
  替换时逐处确认，表达这种意图的一律用 `atLeast`。
- `access.ts` 的主干道兜底宽度是在没有路网时的近似值，替换后要确认它仍然只是近似。

---

## 6. 第二期（单独评审，本期不做）

桥和路面的几何规范。阈值要先测量再定，做法同 `VALIDATION_CONFIG`：先测历史包络，再加余量，并引用验收集证据。

| 指标 | 现状 | 怎么定 |
|---|---|---|
| 路面纵坡上限 `maxGrade` | 没有，只有试驾的台阶和扭转判定 | 测 15 城桥面和引道的纵坡分布，对齐车辆爬坡能力 |
| 桥头缓和段 `bridgeTransition` | `bridgeDeckProfile` 每 0.5 一段渐变，长度由落地区决定 | 测现有通过试驾的桥头最短缓和段 |
| 最大斜交角 `maxBridgeSkewDeg` | 没有；机场堤道选起点时自己用了 40° | 用试驾通过与失败的桥头分出界线 |
| 桥下净空 | 没有 | 只在桥跨越道路时有意义，需先统计 |

这些一旦开始拒绝，就会让部分城市的路网换形（桥被拒、改道），基线会变。所以要先评审阈值，再决定是只报告还是拒绝。

---

## 附：相关的已知问题

`verify-react-city-geography` 在种子 3576928465 上曾经失败：一座长 9.9 的短桥下面的浅水被桥头土方
（`roadLandingGrading`）填高到 ≥ 0.5，桥看起来架在陆地上。`main` 已经由 90fccf84 修复（桥跨下的浅水不再被填）。
它暴露出：「桥必须跨越水或道路」目前只是验收脚本里的事后检查，没有准入规则。建议列为第二期的一条。
