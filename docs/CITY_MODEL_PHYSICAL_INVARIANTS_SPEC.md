# City 模型内置守卫：物理属性化 SPEC

> 状态：设计（2026-10-08）。上位文档：`CITY_NETWORK_FIRST_CODE_DESIGN.md` §5（占地/入口/结构）、
> `CITY_BUILDING_MODEL_SPEC.md`（建筑统一范式）。调研基线：`city-network-first` @ `99155ff3`
> （批次 1–3.2 + 6a/6b 已合入）；A 轨连接器（批次 4/5）合入时本文第 6 节的落点按其最终形态对齐。

## 1. 问题：守卫的两种成本

现状守卫是**外部几何检查**：每个守卫拿着自己的判据去逐岛扫描对象（16 点采样圆、线段距离、
度数统计）。两个代价：

- **判据多副本**：同一「占地不压路」语义在 constraints / siting / repairs / 地块终筛各有实现
  （批次 1/3-2 一直在还这笔债：height≥2.5 地形代理、海段/河岸段切片分歧）。
- **检查量级**：O(岛数 × 对象数) 的重复求交——120 岛普查每轮都重算同样的几何事实。

**属性化**把「对象自身的几何事实」变成模型自带数据，检查退化为构造期断言或单点求交；
跨对象/全局不变量仍归守卫。判据唯一来源从「守卫实现」移到「模型声明」。

## 2. 判据：什么能属性化

| 能（单对象事实） | 不能（跨对象/全局关系） |
| --- | --- |
| 占地形状（宽深/旋转/凸多边形并集）与地形求交（落水/悬空） | 连通性（分量归属是全图性质） |
| 入口位置与朝向（局部坐标） | 锐角路口、主干扎堆（相邻边关系） |
| 桥段跨距与两端结构锚点（桥头连续） | 广场居中（用地 × 骨架两系统） |
| 高架 deck 高度/半宽包络 × 障碍净空 | 确定性 / 跨引擎一致（关于生成器） |
| 楼型宽深范围 ↔ 地块容量匹配 | 车流、性能（动态） |

原则：**属性回答「我是什么」，守卫回答「我们之间合不合法」**。属性化后守卫不消失，
而是从几何扫描降为类型/一致性断言。

## 3. 首批属性清单

### 3.1 用地/建筑（SiteSpec 行扩展；B 轨已备好挂点）

```ts
type PhysicalFootprint =
  | { shape: "circle"; radius: number }                                  // 现状，降级为包围初筛
  | { shape: "rect"; width: number; depth: number; yaw: number }         // 定向矩形（已实现 orientedRectPolygon）
  | { shape: "convex"; polygon: Vec2[] }                                 // 凸多边形（已实现 pointToPolygonDistance）
  | { shape: "union"; parts: Array<PhysicalFootprint> };                 // 多体建筑（如塔+裙房）
type PhysicalSite = {
  footprint: PhysicalFootprint;      // 占地（硬判据与终筛共用同一份）
  entrance: { local: Vec2; facing: number };   // 入口局部坐标与朝向（世界坐标由放置 yaw 变换）
  groundOffset: number;              // 基座相对地形的抬升/找平需求（悬空检测）
};
```

- 落点：`planner/sitespec.ts` 每行增加 `physical` 字段；`planner/access.ts::siteCandidateHardReject`
  的 hard 判据从「radius+阈值」切到这份形状（`footprint.ts` 的 `footprintClearsRoadBand` 已就位）。
- 效果：`siteInWater` / `roadThroughSite` 的逐岛 16 点采样 → 放置期一次精确求交；
  长条/旋转模型的角点压路（评审 P2）从不可见变为构造期拒绝。

### 3.2 路段结构（RoadEdge 扩展；随批次 8 分层一起）

```ts
type EdgeStructure =
  | { kind: "ground" }
  | { kind: "bridge"; span: number; deckY: number; anchors: [Vec2, Vec2] }  // 桥段自带跨距与两端
  | { kind: "elevated"; deckY: number; clearance: number };                 // 高架：deck 高与净空半宽
```

- 桥头连续：桥段的 `anchors` 两端必须是 ground 段节点——**类型断言**，替代全图找断头。
- 高架净空：`clearance` 作为包络半径，出口弦/并线校验（corridor validator）一处引用。
- 迁移：内部结构先行，`RoadEdge.bridge: boolean` 保留为 finalize 兼容投影（设计 §4.2 原文）。

### 3.3 建筑楼型（archetype ↔ parcel 匹配）

- archetype 声明 `width/depth` 范围；parcel 生成时按地块尺寸过滤可行楼型。
- 效果：`crownFinMesh.count` 类「模型几何与实例化批次失配」bug 构造性不可表达
  （该事故的守卫补丁仍保留，作为批次一致性的回归网）。

## 4. 守卫吸收映射

| 现有守卫 | 去向 |
| --- | --- |
| siteInWater / roadThroughSite（逐岛采样） | **吸收**：放置期 footprint 求交（3.1）；守卫降频为抽样回归 |
| 地块终筛（圆口径 segmentDistance） | **吸收**：`footprintClearsRoadBand` 精确复核（B 轨接线清单 #4） |
| suspensionBridgeClearOfHighways | **吸收**：EdgeStructure.clearance 包络求交（3.2） |
| stationDoorFacesRoad / archStraddlesRoad | **半吸收**：entrance 属性承担朝向计算；「最近路存在」仍需网络关系 |
| looseInlandRoadEnds | 部分保留：EndpointRole 属性化端点归属后，守卫只剩「must-connect 端为空」的计数 |
| disconnectedComponents / acuteJunctions / crowdedArterials | **保留**（全局/相邻关系，无归属对象） |
| civicPlazaCentred / 确定性 / 跨引擎 | **保留** |
| 新增：**声明一致性守卫** | 每个建模建筑一次「声明属性 ↔ 渲染几何」核对（O(模型数)≈15），见 §5 |

普查收益估算：120 岛 × ~10 用地的落水/压路扫描 → 15 行声明的一致性断言 + 放置期 O(候选) 求交。

## 5. 新风险与对策：属性会说谎

属性与真实几何失配时，属性化把错误**藏深**（所有下游都信声明）。对策分三层：

1. **声明一致性守卫**（新）：对每个建模建筑，用其几何构建代码的输出反算 footprint（顶点包围 →
   凸包 → 与声明比对），偏差 > 0.5 即红。单点、离线、进 verify:city。
2. **属性版本化**：PhysicalFootprint / EdgeStructure 携带 version；改模型几何必须同步改声明，
   golden 把两者钉在一起（改其一不变另一个 = 守卫红）。
3. **抽样回归网**：保留现普查的 5–10% 种子跑旧外部判据，作为属性路径的对照（防「一致性守卫
   自己也错了」的共模失效）；两个季度无分歧后可撤。

## 6. 分批落地

| 批 | 内容 | 依赖 |
| --- | --- | --- |
| P0-a | 3.3 楼型宽深 ↔ parcel 过滤（最便宜，无行为争议——只影响不可行组合） | 无 |
| P0-b | 3.1 footprint 属性 + hard 判据切换 + 地块终筛切换（B 轨接线 #4） | B 轨（已就位） |
| P0-c | §5.1 声明一致性守卫 + §5.3 抽样对照（P0-b 同批或先行） | P0-b |
| P1 | 3.2 EdgeStructure（桥 anchors / 高架 clearance），桥头连续转类型断言 | A 轨连接器 + 批次 8 分层 |
| P2 | entrance 属性启用（stationDoor/archStraddles 半吸收）；union footprint 多体建筑 | P0/P1 验收后 |

验收口径沿用《路网优先设计》§8：行为变更批走「普查阈值=实测 + golden 审后更新 + 合成场景守卫 +
固定岛截图」；纯声明新增批要求基线哈希不变。

## 7. 非目标

- 不把跨对象守卫（连通/锐角/居中）塞进模型——它们没有归属对象，属性化只会造出循环依赖。
- 不改渲染契约：属性服务于规划与校验；CityLayout 对外形状按设计非目标保持。
- 不追求「零守卫」：终态是 **15 行声明断言 + 一组全局不变量**，守卫数量下降但职责更清晰。
